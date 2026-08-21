/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  loadAssetOptions,
  loadTokenOptions,
  pollVideoTask,
  submitVideo,
} from './api'
import { AssetUrlInput } from './components/asset-url-input'
import { FieldSelect } from './components/field-select'
import { ReferenceMediaEditor } from './components/reference-media-editor'
import { VideoRecords } from './components/video-records'
import { VideoResultCard } from './components/video-result-card'
import {
  DEFAULT_MODEL,
  DEFAULT_RATIO,
  DEFAULT_RESOLUTION,
  DURATION_DEFAULT,
  DURATION_MAX,
  DURATION_MIN,
  MAX_REF_AUDIOS,
  MAX_REF_IMAGES,
  MAX_REF_VIDEOS,
  RATIO_OPTIONS,
  RESOLUTION_OPTIONS,
  VIDEO_MODELS,
  VIDEO_POLL_INTERVAL_MS,
  VIDEO_RECORDS_QUERY_KEY,
} from './constants'
import {
  buildBody,
  buildContent,
  extractError,
  isFailStatus,
  isSuccessStatus,
} from './lib'
import type { VideoMode, VideoResult } from './types'

export function VideoGenerationContent() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: tokenOptions = [] } = useQuery({
    queryKey: ['video-token-options'],
    queryFn: loadTokenOptions,
  })
  const { data: assetOptions = [] } = useQuery({
    queryKey: ['video-asset-options'],
    queryFn: loadAssetOptions,
  })

  const [apiKey, setApiKey] = useState('')
  const [mode, setMode] = useState<VideoMode>('text')
  const [prompt, setPrompt] = useState('')
  const [firstFrame, setFirstFrame] = useState('')
  const [lastFrame, setLastFrame] = useState('')
  const [refImages, setRefImages] = useState<string[]>([''])
  const [refVideos, setRefVideos] = useState<string[]>([])
  const [refAudios, setRefAudios] = useState<string[]>([])
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION)
  const [ratio, setRatio] = useState(DEFAULT_RATIO)
  const [duration, setDuration] = useState(DURATION_DEFAULT)
  const [generateAudio, setGenerateAudio] = useState(false)
  const [watermark, setWatermark] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<VideoResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!apiKey && tokenOptions.length > 0) {
      setApiKey(tokenOptions[0].value)
    }
  }, [apiKey, tokenOptions])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const pollTask = useCallback(
    (taskId: string, key: string) => {
      const tick = async () => {
        try {
          const data = await pollVideoTask(key, taskId)
          setProgress(data.progress || '')
          if (isSuccessStatus(data.status)) {
            setPolling(false)
            setResult({ url: data.result_url, quota: data.quota })
            toast.success(t('Video generation complete'))
            void queryClient.invalidateQueries({
              queryKey: VIDEO_RECORDS_QUERY_KEY,
            })
            return
          }
          if (isFailStatus(data.status)) {
            setPolling(false)
            setErrorMsg(data.fail_reason || t('Generation failed'))
            return
          }
          timerRef.current = setTimeout(tick, VIDEO_POLL_INTERVAL_MS)
        } catch (e) {
          setPolling(false)
          setErrorMsg(extractError(e))
        }
      }
      void tick()
    },
    [t, queryClient]
  )

  const handleSubmit = async () => {
    const form = {
      mode,
      prompt,
      firstFrame,
      lastFrame,
      refImages,
      refVideos,
      refAudios,
    }
    if (!apiKey) {
      toast.error(t('No available token'))
      return
    }
    if (!prompt.trim()) {
      toast.error(t('Please enter a prompt'))
      return
    }
    if (mode === 'first' && !firstFrame.trim()) {
      toast.error(
        t(
          'Please provide the first-frame image URL or enter an asset:// reference'
        )
      )
      return
    }
    if (mode === 'firstlast' && (!firstFrame.trim() || !lastFrame.trim())) {
      toast.error(t('First & last frame mode needs both frames'))
      return
    }
    if (mode === 'reference' && buildContent(mode, form).length === 0) {
      toast.error(t('Reference mode needs at least one reference asset'))
      return
    }

    clearTimeout(timerRef.current)
    setSubmitting(true)
    setErrorMsg('')
    setResult(null)
    setProgress('')
    try {
      const body = buildBody({
        model,
        prompt,
        duration,
        resolution,
        ratio,
        generateAudio,
        watermark,
        mode,
        form,
      })
      const res = await submitVideo(apiKey, body)
      const taskId = res.task_id || res.id
      if (!taskId) {
        setErrorMsg(t('Submit failed: no task ID returned'))
        return
      }
      setPolling(true)
      pollTask(taskId, apiKey)
    } catch (e) {
      setErrorMsg(extractError(e))
    } finally {
      setSubmitting(false)
    }
  }

  const modeItems = [
    { value: 'text', label: t('Text to Video') },
    { value: 'first', label: t('Image to Video (First Frame)') },
    { value: 'firstlast', label: t('First & Last Frame') },
    {
      value: 'reference',
      label: t('Multimodal Reference (Image/Video/Audio)'),
    },
  ]

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Seedance 2.0: text-to-video / image-to-video (first frame) / first & last frame / multimodal reference (image, video, audio). Provide a public URL or enter an asset:// reference.'
        )}
      </p>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Parameters')}</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1.5'>
              <Label>{t('API Key')}</Label>
              <FieldSelect
                value={apiKey}
                items={tokenOptions}
                onValueChange={setApiKey}
                placeholder={t('Select your token')}
              />
              <span className='text-muted-foreground text-xs'>
                {t('Defaults to your first active token; you can switch.')}
              </span>
            </div>

            <div className='flex flex-col gap-1.5'>
              <Label>{t('Generation Mode')}</Label>
              <FieldSelect
                value={mode}
                items={modeItems}
                onValueChange={(v) => setMode(v as VideoMode)}
              />
            </div>

            <div className='flex flex-col gap-1.5'>
              <Label>{t('Prompt')}</Label>
              <Textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('Describe the scene content')}
              />
            </div>

            {(mode === 'first' || mode === 'firstlast') && (
              <div className='flex flex-col gap-1.5'>
                <Label>{t('First Frame Image')}</Label>
                <AssetUrlInput
                  value={firstFrame}
                  onChange={setFirstFrame}
                  placeholder={t('https:// or asset://')}
                  assetOptions={assetOptions}
                />
              </div>
            )}

            {mode === 'firstlast' && (
              <div className='flex flex-col gap-1.5'>
                <Label>{t('Last Frame Image')}</Label>
                <AssetUrlInput
                  value={lastFrame}
                  onChange={setLastFrame}
                  placeholder={t('https:// or asset://')}
                  assetOptions={assetOptions}
                />
              </div>
            )}

            {mode === 'reference' && (
              <>
                <ReferenceMediaEditor
                  label={t('Reference Images')}
                  list={refImages}
                  onChange={setRefImages}
                  max={MAX_REF_IMAGES}
                  type='image'
                  assetOptions={assetOptions}
                />
                <ReferenceMediaEditor
                  label={t('Reference Videos')}
                  list={refVideos}
                  onChange={setRefVideos}
                  max={MAX_REF_VIDEOS}
                  type='video'
                  assetOptions={assetOptions}
                />
                <ReferenceMediaEditor
                  label={t('Reference Audios')}
                  list={refAudios}
                  onChange={setRefAudios}
                  max={MAX_REF_AUDIOS}
                  type='audio'
                  assetOptions={assetOptions}
                />
              </>
            )}

            <div className='flex flex-col gap-1.5'>
              <Label>{t('Model')}</Label>
              <FieldSelect
                value={model}
                items={VIDEO_MODELS.map((m) => ({ value: m, label: m }))}
                onValueChange={setModel}
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='flex flex-col gap-1.5'>
                <Label>{t('Resolution')}</Label>
                <FieldSelect
                  value={resolution}
                  items={RESOLUTION_OPTIONS.map((r) => ({
                    value: r,
                    label: r,
                  }))}
                  onValueChange={setResolution}
                />
              </div>
              <div className='flex flex-col gap-1.5'>
                <Label>{t('Aspect Ratio')}</Label>
                <FieldSelect
                  value={ratio}
                  items={RATIO_OPTIONS.map((r) => ({ value: r, label: r }))}
                  onValueChange={setRatio}
                />
              </div>
            </div>

            <div className='flex flex-col gap-2'>
              <Label>
                {t('Duration (seconds):')} {duration}
              </Label>
              <Slider
                min={DURATION_MIN}
                max={DURATION_MAX}
                value={duration}
                onValueChange={(v) => setDuration(Array.isArray(v) ? v[0] : v)}
              />
            </div>

            <div className='flex items-center gap-6'>
              <label className='flex items-center gap-2 text-sm'>
                <Switch
                  checked={generateAudio}
                  onCheckedChange={(c) => setGenerateAudio(c)}
                />
                {t('Generate Audio')}
              </label>
              <label className='flex items-center gap-2 text-sm'>
                <Switch
                  checked={watermark}
                  onCheckedChange={(c) => setWatermark(c)}
                />
                {t('Watermark')}
              </label>
            </div>

            <Button
              className='w-full'
              disabled={submitting || polling}
              onClick={handleSubmit}
            >
              {polling ? t('Generating...') : t('Generate Video')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Result')}</CardTitle>
          </CardHeader>
          <CardContent>
            <VideoResultCard
              submitting={submitting}
              polling={polling}
              progress={progress}
              result={result}
              errorMsg={errorMsg}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('History')}</CardTitle>
        </CardHeader>
        <CardContent>
          <VideoRecords />
        </CardContent>
      </Card>
    </div>
  )
}
