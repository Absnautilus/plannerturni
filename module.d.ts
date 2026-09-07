import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComponentType } from 'react'

export interface TurniModuleProps {
  supabaseClient: SupabaseClient
}

export const TurniModule: ComponentType<TurniModuleProps>
export default TurniModule
