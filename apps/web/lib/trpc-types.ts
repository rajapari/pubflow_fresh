// This file re-exports the AppRouter type from the API
// The actual router lives in apps/api — we import the TYPE only (not the code)
// This avoids bundling server code into the browser

export type { AppRouter } from '../../api/src/routers/index'
