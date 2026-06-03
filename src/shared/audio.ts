export interface AudioFileMetadata {
  extension: string
  contentType: string
}

const AUDIO_MIME_MAP: Record<string, AudioFileMetadata> = {
  'audio/webm': { extension: 'webm', contentType: 'audio/webm' },
  'audio/webm;codecs=opus': { extension: 'webm', contentType: 'audio/webm' },
  'audio/ogg': { extension: 'ogg', contentType: 'audio/ogg' },
  'audio/ogg;codecs=opus': { extension: 'opus', contentType: 'audio/opus' },
  'audio/wav': { extension: 'wav', contentType: 'audio/wav' },
  'audio/wave': { extension: 'wav', contentType: 'audio/wav' },
  'audio/mpeg': { extension: 'mp3', contentType: 'audio/mpeg' },
  'audio/mp4': { extension: 'm4a', contentType: 'audio/mp4' },
  'audio/aac': { extension: 'aac', contentType: 'audio/aac' },
  'audio/flac': { extension: 'flac', contentType: 'audio/flac' }
}

export function resolveAudioFileMetadata(mimeType: string): AudioFileMetadata {
  const normalized = mimeType.toLowerCase()
  return AUDIO_MIME_MAP[normalized] ?? AUDIO_MIME_MAP[normalized.split(';')[0]] ?? AUDIO_MIME_MAP['audio/webm']
}
