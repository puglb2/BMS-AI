import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'

const el = document.getElementById('bms-ai-root')!
createRoot(el).render(<App />)
