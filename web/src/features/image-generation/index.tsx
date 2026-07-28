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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'

import { loadModelOptions, loadTokenOptions, submitImage } from './api'
import { FieldSelect } from './components/field-select'
import { ImageRecords } from './components/image-records'
import { ImageResultCard } from './components/image-result-card'
import {
  DEFAULT_QUALITY,
  DEFAULT_SIZE,
  IMAGE_RECORDS_QUERY_KEY,
  N_DEFAULT,
  N_MAX,
  N_MIN,
  QUALITY_OPTIONS,
  SIZE_OPTIONS,
} from './constants'
import { buildBody, extractError, parseImages, pickDefaultModel } from './lib'

export function ImageGenerationContent() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { data: tokenOptions = [] } = useQuery({
    queryKey: ['image-token-options'],
    queryFn: loadTokenOptions,
  })
  const { data: modelOptions = [] } = useQuery({
    queryKey: ['image-model-options'],
    queryFn: loadModelOptions,
  })

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [count, setCount] = useState(N_DEFAULT)
  const [quality, setQuality] = useState(DEFAULT_QUALITY)

  const [submitting, setSubmitting] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!apiKey && tokenOptions.length > 0) {
      setApiKey(tokenOptions[0].value)
    }
  }, [apiKey, tokenOptions])

  useEffect(() => {
    if (!model && modelOptions.length > 0) {
      setModel(pickDefaultModel(modelOptions.map((m) => m.value)))
    }
  }, [model, modelOptions])

  const handleSubmit = async () => {
    if (!apiKey) {
      toast.error(t('No available token'))
      return
    }
    if (!model) {
      toast.error(t('Please select a model'))
      return
    }
    if (!prompt.trim()) {
      toast.error(t('Please enter a prompt'))
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    setImages([])
    try {
      const body = buildBody({ model, prompt, n: count, size, quality })
      const res = await submitImage(apiKey, body)
      const urls = parseImages(res)
      if (urls.length === 0) {
        setErrorMsg(t('No image returned'))
        return
      }
      setImages(urls)
      toast.success(t('Image generation complete'))
      // Refresh the records list; the drawing log may lag slightly.
      setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: IMAGE_RECORDS_QUERY_KEY,
        })
      }, 1500)
    } catch (e) {
      setErrorMsg(extractError(e))
    } finally {
      setSubmitting(false)
    }
  }

  const qualityItems = QUALITY_OPTIONS.map((q) => ({
    value: q,
    label: q === 'default' ? t('Default') : q,
  }))

  return (
    <div className='flex flex-col gap-4'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Text-to-image playground: pick a token and model, describe your image, and generate. Recent generations appear under History.'
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
              <Label>{t('Model')}</Label>
              <FieldSelect
                value={model}
                items={modelOptions}
                onValueChange={setModel}
                placeholder={t('Select a model')}
              />
            </div>

            <div className='flex flex-col gap-1.5'>
              <Label>{t('Prompt')}</Label>
              <Textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('Describe the image you want')}
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='flex flex-col gap-1.5'>
                <Label>{t('Size')}</Label>
                <FieldSelect
                  value={size}
                  items={SIZE_OPTIONS.map((s) => ({ value: s, label: s }))}
                  onValueChange={setSize}
                />
              </div>
              <div className='flex flex-col gap-1.5'>
                <Label>{t('Quality')}</Label>
                <FieldSelect
                  value={quality}
                  items={qualityItems}
                  onValueChange={setQuality}
                />
              </div>
            </div>

            <div className='flex flex-col gap-2'>
              <Label>
                {t('Count')}: {count}
              </Label>
              <Slider
                min={N_MIN}
                max={N_MAX}
                value={count}
                onValueChange={(v) => setCount(Array.isArray(v) ? v[0] : v)}
              />
            </div>

            <Button
              className='w-full'
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? t('Generating...') : t('Generate Image')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('Result')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ImageResultCard
              loading={submitting}
              images={images}
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
          <ImageRecords />
        </CardContent>
      </Card>
    </div>
  )
}
