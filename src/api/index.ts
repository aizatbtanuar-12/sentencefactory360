import { demoApi } from './demoApi';
import { supabaseApi, supabaseConfigured } from './supabaseApi';
import type { Api } from './types';

export const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';

/** The backend in use: Supabase Edge Functions, or the in-browser demo backend. */
export const api: Api = isDemo ? demoApi : supabaseApi;
export const backendReady = isDemo || supabaseConfigured;

export * from './types';
