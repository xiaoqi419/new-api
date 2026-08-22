/**
 * Locally pinned exports from the Figma homepage reference.
 *
 * The source URLs are retained as provenance only; application code should
 * reference the local `path` values so the page does not depend on Figma's
 * short-lived asset endpoint.
 */
export type HomeFigmaAsset = {
  path: string
  sourceUrl: string
  format: 'png' | 'svg'
}

export type HomeFigmaNodeAssets = {
  fileKey: 'SnTAn1XXoaAvEQgG61mm38'
  nodeId: '6:2' | '44:2'
  mode: 'light' | 'dark'
  export: HomeFigmaAsset
  svgAssets: HomeFigmaAsset[]
}

const FILE_KEY = 'SnTAn1XXoaAvEQgG61mm38' as const

const lightSvgUrls = [
  '8ff03abb-03f2-4dc5-97a1-b06897860204',
  'c7116fa1-03d6-45a8-891a-880251de8d36',
  '9402f06d-1f14-459e-9935-721081fbda68',
  'bb0cede5-254d-426f-a978-55c88ede8dfd',
  'f087e6b9-a38d-49f5-afb1-f300f8595c7f',
  '79910057-3e2e-4474-bfa6-c1f2443244fa',
  '73032e43-1687-4022-b4e1-8c585a49787e',
  'b9c78ac1-381c-4e78-87da-eb8740aa087e',
  'f9626bf6-4ec1-46b5-aa05-860557947607',
  'df7ff711-4388-44dc-95fc-ae44699224fd',
  'd9c60754-f1db-4c81-8181-ad753fee8666',
  '1db772d3-8230-453c-a3de-5f250917eabb',
  '8860c084-b52a-4d87-8398-3408273ee35c',
  'c5313cbc-b77e-4640-96c0-a3c02624916b',
  'cbe9e4f1-1e2e-47ce-9e2f-8ffdf893ccf2',
  'b822f163-3d32-427f-b7d9-fe9e895354cc',
  '881a53ab-757d-4bda-af29-41d3f91f6511',
  '02b0feaa-c2f8-4fb4-8527-2a495cda97f1',
  '840eed07-4bae-47ac-a991-92aba686ea5e',
] as const

const darkSvgUrls = [
  '804133de-5dd2-4bce-a5c8-cfd54a4a1d1c',
  '515d478d-e395-4fca-8482-0055311b9a36',
  '02b82a6f-bc4d-40a4-8121-d668bdb1783f',
  '17970c91-6fdb-437a-839b-674f23cb56df',
  '7cb6f1ca-36e4-4017-a673-8f7f62b9c2e2',
  'd8c0ee68-e508-4581-8818-7f86766da3cf',
  '8355887a-39be-4b3c-ad91-2c1d70bbf7b4',
  'f813f6b8-673d-4e53-82c1-4248b298bd8e',
  '18cecf93-2362-46e1-8103-553dab9a3fb2',
  '889895cd-8707-40cb-a129-e21af6282880',
  '3ce2ad43-94d0-44af-ae7e-f6a82e202d9c',
  '5466abf0-d799-42be-be92-53ff6d360722',
  '2df049ad-7548-4079-a9d0-f18789510aa1',
  '0cd2de76-1299-455b-bad8-a74b7fa57b61',
  '7dc6988a-ac59-4d9e-8f59-ca40317ad87c',
  'a00a5251-6561-4158-859e-bfae62daf195',
  'bbf55055-7ef2-46a8-a23f-1e4d8176c625',
  'bb39e65c-3d44-4293-85fc-d8ed8e38bfa4',
] as const

function toSvgAssets(mode: 'light' | 'dark', ids: readonly string[]) {
  return ids.map((id, index) => ({
    path: `/assets/home-figma/${mode}/asset-${String(index + 1).padStart(2, '0')}.svg`,
    sourceUrl: `https://www.figma.com/api/mcp/asset/${id}.svg`,
    format: 'svg' as const,
  }))
}

export const HOME_FIGMA_ASSETS: HomeFigmaNodeAssets[] = [
  {
    fileKey: FILE_KEY,
    nodeId: '6:2',
    mode: 'light',
    export: {
      path: '/assets/home-figma/light/node-6-2-export.png',
      sourceUrl:
        'https://www.figma.com/api/mcp/asset/14c01f29-3039-4ecd-9e80-efdf8fbd1749.png',
      format: 'png',
    },
    svgAssets: toSvgAssets('light', lightSvgUrls),
  },
  {
    fileKey: FILE_KEY,
    nodeId: '44:2',
    mode: 'dark',
    export: {
      path: '/assets/home-figma/dark/node-44-2-export.png',
      sourceUrl:
        'https://www.figma.com/api/mcp/asset/9c94c1c7-9857-40fc-9980-3be17c2a3e9b.png',
      format: 'png',
    },
    svgAssets: toSvgAssets('dark', darkSvgUrls),
  },
]

export const HOME_FIGMA_ASSET_BY_MODE = {
  light: HOME_FIGMA_ASSETS[0],
  dark: HOME_FIGMA_ASSETS[1],
} as const
