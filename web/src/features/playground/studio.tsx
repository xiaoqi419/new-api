/*
Copyright (C) 2023-2026 QuantumNous

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
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImageGenerationContent } from '@/features/image-generation'
import { VideoGenerationContent } from '@/features/video-generation'

import { Playground } from './index'
import {
  isPlaygroundSectionId,
  PLAYGROUND_DEFAULT_SECTION,
  type PlaygroundSectionId,
} from './section-registry'

const route = getRouteApi('/_authenticated/playground/$section')

const SECTION_ORDER: PlaygroundSectionId[] = ['chat', 'image', 'video']
const SECTION_LABEL: Record<PlaygroundSectionId, string> = {
  chat: 'Chat',
  image: 'Image Generation',
  video: 'Video Generation',
}

export function PlaygroundStudio() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = route.useParams()
  const active: PlaygroundSectionId = isPlaygroundSectionId(params.section)
    ? params.section
    : PLAYGROUND_DEFAULT_SECTION

  const handleSectionChange = useCallback(
    (section: string) => {
      void navigate({
        to: '/playground/$section',
        params: { section: section as PlaygroundSectionId },
      })
    },
    [navigate]
  )

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Playground')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex h-full min-h-0 flex-col gap-4'>
          <Tabs value={active} onValueChange={handleSectionChange}>
            <TabsList className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
              {SECTION_ORDER.map((section) => (
                <TabsTrigger key={section} value={section}>
                  {t(SECTION_LABEL[section])}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className='min-h-0 flex-1 overflow-hidden'>
            {active === 'chat' && <Playground />}
            {active === 'image' && (
              <div className='h-full overflow-auto'>
                <ImageGenerationContent />
              </div>
            )}
            {active === 'video' && (
              <div className='h-full overflow-auto'>
                <VideoGenerationContent />
              </div>
            )}
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
