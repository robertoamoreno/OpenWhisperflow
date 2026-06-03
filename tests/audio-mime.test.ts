import { describe, expect, it } from 'vitest'
import { resolveAudioFileMetadata } from '../src/shared/audio'

describe('resolveAudioFileMetadata', () => {
  it('maps MediaRecorder webm opus output to Together-supported webm metadata', () => {
    expect(resolveAudioFileMetadata('audio/webm;codecs=opus')).toEqual({
      extension: 'webm',
      contentType: 'audio/webm'
    })
  })

  it('falls back to webm for unknown browser audio types', () => {
    expect(resolveAudioFileMetadata('audio/custom')).toEqual({
      extension: 'webm',
      contentType: 'audio/webm'
    })
  })
})
