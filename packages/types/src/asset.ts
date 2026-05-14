import { z } from 'zod'

export const AssetTypeSchema = z.enum(['FIGURE','TABLE','SUPPLEMENTARY','COVER'])
export type AssetType = z.infer<typeof AssetTypeSchema>

export const ColorModeSchema = z.enum(['RGB','CMYK','GRAYSCALE','LAB'])
export type ColorMode = z.infer<typeof ColorModeSchema>

export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg','image/png','image/tiff','image/webp',
  'image/svg+xml','application/postscript','application/pdf',
] as const

export const MAX_ASSET_SIZE_MB = 100
