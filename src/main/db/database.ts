import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import Database from 'better-sqlite3'
import type {
  AppSettings,
  DiagnosticError,
  DictionaryTerm,
  HistoryItem,
  LocalDataSummary,
  Transform,
  UsageSummary,
  UsageWindow
} from '../../shared/types'

const MODEL_PRICING: Record<string, { asrPerHour?: number; inputPerMTok?: number; outputPerMTok?: number }> = {
  'claude-3-5-haiku-20241022': { inputPerMTok: 0.8, outputPerMTok: 4 },
  'claude-3-5-sonnet-20241022': { inputPerMTok: 3, outputPerMTok: 15 }
}

export class AppDatabase {
  private readonly db: Database.Database

  constructor(databasePath = `${app.getPath('userData')}/openwhisperflow.sqlite`) {
    this.db = new Database(databasePath)
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  get path(): string {
    return this.db.name
  }

  insertHistory(item: Omit<HistoryItem, 'id' | 'createdAt'>): HistoryItem {
    const historyItem: HistoryItem = {
      ...item,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    }

    const params = {
      ...historyItem,
      flowType: historyItem.flowType ?? 'dictation',
      instructionText: historyItem.instructionText ?? null,
      selectedText: historyItem.selectedText ?? null,
      appName: historyItem.appName ?? null,
      contextJson: historyItem.contextJson ?? '{}',
      audioMimeType: historyItem.audioMimeType ?? null,
      audioFilePath: historyItem.audioFilePath ?? null,
      asrProvider: historyItem.asrProvider ?? null,
      asrModel: historyItem.asrModel ?? null,
      llmProvider: historyItem.llmProvider ?? null,
      llmModel: historyItem.llmModel ?? null,
      contextIncluded: historyItem.contextIncluded ? 1 : 0,
      screenshotIncluded: historyItem.screenshotIncluded ? 1 : 0,
      error: historyItem.error ?? null,
      rawError: historyItem.rawError ?? null
    }

    this.db
      .prepare(
        `insert into history (
          id, flow_type, raw_text, formatted_text, instruction_text, selected_text,
          app_name, duration_ms, status, context_json, audio_mime_type, audio_file_path,
          asr_provider, asr_model, llm_provider, llm_model, context_included, screenshot_included,
          error, raw_error, created_at
        ) values (
          @id, @flowType, @rawText, @formattedText, @instructionText, @selectedText,
          @appName, @durationMs, @status, @contextJson, @audioMimeType, @audioFilePath,
          @asrProvider, @asrModel, @llmProvider, @llmModel, @contextIncluded, @screenshotIncluded,
          @error, @rawError, @createdAt
        )`
      )
      .run(params)

    return historyItem
  }

  listHistory(query = ''): HistoryItem[] {
    const like = `%${query.trim()}%`
    const rows = query.trim()
      ? this.db
          .prepare(
            `select * from history
             where raw_text like @like or formatted_text like @like or app_name like @like
                or instruction_text like @like or selected_text like @like or flow_type like @like
             order by created_at desc
             limit 200`
          )
          .all({ like })
      : this.db.prepare('select * from history order by created_at desc limit 200').all()

    return rows.map(mapHistoryRow)
  }

  getHistory(id: string): HistoryItem | undefined {
    const row = this.db.prepare('select * from history where id = ?').get(id)
    return row ? mapHistoryRow(row) : undefined
  }

  deleteHistory(id: string): void {
    this.db.prepare('delete from history where id = ?').run(id)
  }

  recordUsage(input: {
    model: string
    asrSeconds?: number
    inputTokens?: number
    outputTokens?: number
  }): void {
    const date = new Date().toISOString().slice(0, 10)
    this.db
      .prepare(
        `insert into usage_daily (date, model, asr_seconds, input_tokens, output_tokens)
         values (@date, @model, @asrSeconds, @inputTokens, @outputTokens)
         on conflict(date, model) do update set
          asr_seconds = asr_seconds + excluded.asr_seconds,
          input_tokens = input_tokens + excluded.input_tokens,
          output_tokens = output_tokens + excluded.output_tokens`
      )
      .run({
        date,
        model: input.model,
        asrSeconds: input.asrSeconds ?? 0,
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0
      })
  }

  getUsageSummary(): UsageSummary {
    const rows = this.db.prepare('select * from usage_daily').all() as Array<Record<string, unknown>>
    const now = new Date().toISOString().slice(0, 10)
    const month = now.slice(0, 7)
    const summary: UsageSummary = {
      today: emptyUsageWindow(),
      month: emptyUsageWindow(),
      allTime: emptyUsageWindow()
    }

    for (const row of rows) {
      const model = String(row.model)
      const date = String(row.date)
      const usage = {
        estimatedCostUsd: estimateCost(model, Number(row.asr_seconds), Number(row.input_tokens), Number(row.output_tokens)),
        asrSeconds: Number(row.asr_seconds),
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens)
      }
      addUsageWindow(summary.allTime, usage)
      if (date.startsWith(month)) addUsageWindow(summary.month, usage)
      if (date === now) addUsageWindow(summary.today, usage)
    }

    return summary
  }

  resetUsage(): UsageSummary {
    this.db.prepare('delete from usage_daily').run()
    return this.getUsageSummary()
  }

  addDiagnostic(source: string, message: string, rawMessage?: string): void {
    this.db
      .prepare(
        `insert into diagnostics (id, source, message, raw_message, created_at)
         values (@id, @source, @message, @rawMessage, @createdAt)`
      )
      .run({
        id: randomUUID(),
        source,
        message,
        rawMessage,
        createdAt: new Date().toISOString()
      })
  }

  getDiagnostics(): DiagnosticError[] {
    const rows = this.db.prepare('select * from diagnostics order by created_at desc limit 100').all()
    return rows.map((row) => {
      const value = row as Record<string, unknown>
      return {
        source: String(value.source),
        message: String(value.message),
        rawMessage: value.raw_message ? String(value.raw_message) : undefined,
        createdAt: String(value.created_at)
      }
    })
  }

  listDictionaryTerms(): DictionaryTerm[] {
    return this.db
      .prepare('select id, phrase, pronunciation, created_at as createdAt from dictionary order by phrase')
      .all() as DictionaryTerm[]
  }

  listTransforms(): Transform[] {
    const rows = this.db.prepare('select * from transforms order by name').all()
    return rows.map((row) => {
      const value = row as Record<string, unknown>
      return {
        id: String(value.id),
        name: String(value.name),
        prompt: String(value.prompt),
        enabled: Boolean(value.enabled),
        shortcut: value.shortcut ? String(value.shortcut) : undefined,
        createdAt: String(value.created_at),
        updatedAt: String(value.updated_at)
      }
    })
  }

  deleteAllData(): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare('delete from history').run()
      this.db.prepare('delete from transforms').run()
      this.db.prepare('delete from dictionary').run()
      this.db.prepare('delete from user_context').run()
      this.db.prepare('delete from meetings').run()
      this.db.prepare('delete from diagnostics').run()
    })
    transaction()
  }

  exportData(settings: AppSettings): { history: HistoryItem[]; settings: AppSettings } {
    return {
      history: this.listHistory(),
      settings
    }
  }

  summary(): LocalDataSummary {
    return {
      databasePath: this.path,
      tables: [
        {
          name: 'history',
          fields: [
            'id',
            'flow_type',
            'raw_text',
            'formatted_text',
            'instruction_text',
            'selected_text',
            'app_name',
            'duration_ms',
            'status',
            'context_json',
            'audio_mime_type',
            'audio_file_path',
            'asr_provider',
            'asr_model',
            'llm_provider',
            'llm_model',
            'context_included',
            'screenshot_included',
            'error',
            'raw_error',
            'created_at'
          ]
        },
        { name: 'usage_daily', fields: ['date', 'model', 'asr_seconds', 'input_tokens', 'output_tokens'] },
        { name: 'diagnostics', fields: ['id', 'source', 'message', 'raw_message', 'created_at'] },
        { name: 'transforms', fields: ['id', 'name', 'prompt', 'enabled', 'shortcut', 'created_at', 'updated_at'] },
        { name: 'dictionary', fields: ['id', 'phrase', 'pronunciation', 'created_at'] },
        { name: 'user_context', fields: ['id', 'key', 'value', 'created_at', 'updated_at'] },
        { name: 'meetings', fields: ['id', 'title', 'transcript', 'summary', 'created_at', 'updated_at'] }
      ]
    }
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists history (
        id text primary key,
        flow_type text not null default 'dictation',
        raw_text text not null,
        formatted_text text not null,
        instruction_text text,
        selected_text text,
        app_name text,
        duration_ms integer not null,
        status text not null,
        context_json text not null,
        audio_mime_type text,
        audio_file_path text,
        asr_provider text,
        asr_model text,
        llm_provider text,
        llm_model text,
        context_included integer not null default 0,
        screenshot_included integer not null default 0,
        error text,
        raw_error text,
        created_at text not null
      );

      create table if not exists usage_daily (
        date text not null,
        model text not null,
        asr_seconds real not null default 0,
        input_tokens integer not null default 0,
        output_tokens integer not null default 0,
        primary key (date, model)
      );

      create table if not exists diagnostics (
        id text primary key,
        source text not null,
        message text not null,
        raw_message text,
        created_at text not null
      );

      create table if not exists transforms (
        id text primary key,
        name text not null,
        prompt text not null,
        enabled integer not null default 1,
        shortcut text,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists dictionary (
        id text primary key,
        phrase text not null unique,
        pronunciation text,
        created_at text not null
      );

      create table if not exists user_context (
        id text primary key,
        key text not null unique,
        value text not null,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists meetings (
        id text primary key,
        title text not null,
        transcript text,
        summary text,
        created_at text not null,
        updated_at text not null
      );
    `)

    this.addColumnIfMissing('history', 'flow_type', "text not null default 'dictation'")
    this.addColumnIfMissing('history', 'instruction_text', 'text')
    this.addColumnIfMissing('history', 'selected_text', 'text')
    this.addColumnIfMissing('history', 'audio_file_path', 'text')
    this.addColumnIfMissing('history', 'asr_provider', 'text')
    this.addColumnIfMissing('history', 'asr_model', 'text')
    this.addColumnIfMissing('history', 'llm_provider', 'text')
    this.addColumnIfMissing('history', 'llm_model', 'text')
    this.addColumnIfMissing('history', 'context_included', 'integer not null default 0')
    this.addColumnIfMissing('history', 'screenshot_included', 'integer not null default 0')
    this.addColumnIfMissing('history', 'raw_error', 'text')
  }

  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>
    if (!columns.some((item) => item.name === column)) {
      this.db.exec(`alter table ${table} add column ${column} ${definition}`)
    }
  }
}

function mapHistoryRow(row: unknown): HistoryItem {
  const value = row as Record<string, unknown>
  return {
    id: String(value.id),
    flowType: (value.flow_type as HistoryItem['flowType']) ?? 'dictation',
    rawText: String(value.raw_text),
    formattedText: String(value.formatted_text),
    instructionText: value.instruction_text ? String(value.instruction_text) : undefined,
    selectedText: value.selected_text ? String(value.selected_text) : undefined,
    appName: value.app_name ? String(value.app_name) : undefined,
    durationMs: Number(value.duration_ms),
    status: value.status as HistoryItem['status'],
    contextJson: String(value.context_json),
    audioMimeType: value.audio_mime_type ? String(value.audio_mime_type) : undefined,
    audioFilePath: value.audio_file_path ? String(value.audio_file_path) : undefined,
    asrProvider: value.asr_provider ? String(value.asr_provider) : undefined,
    asrModel: value.asr_model ? String(value.asr_model) : undefined,
    llmProvider: value.llm_provider ? String(value.llm_provider) : undefined,
    llmModel: value.llm_model ? String(value.llm_model) : undefined,
    contextIncluded: Boolean(value.context_included),
    screenshotIncluded: Boolean(value.screenshot_included),
    error: value.error ? String(value.error) : undefined,
    rawError: value.raw_error ? String(value.raw_error) : undefined,
    createdAt: String(value.created_at)
  }
}

function emptyUsageWindow(): UsageWindow {
  return {
    estimatedCostUsd: 0,
    asrSeconds: 0,
    inputTokens: 0,
    outputTokens: 0
  }
}

function addUsageWindow(target: UsageWindow, source: UsageWindow): void {
  target.estimatedCostUsd += source.estimatedCostUsd
  target.asrSeconds += source.asrSeconds
  target.inputTokens += source.inputTokens
  target.outputTokens += source.outputTokens
}

function estimateCost(model: string, asrSeconds: number, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0
  return (
    ((pricing.asrPerHour ?? 0) * asrSeconds) / 3600 +
    ((pricing.inputPerMTok ?? 0) * inputTokens) / 1_000_000 +
    ((pricing.outputPerMTok ?? 0) * outputTokens) / 1_000_000
  )
}
