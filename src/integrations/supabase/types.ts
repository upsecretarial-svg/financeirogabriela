export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: boolean
          meta_mensal: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          meta_mensal?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          meta_mensal?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      appointment_items: {
        Row: {
          appointment_id: string
          created_at: string
          descricao: string
          id: string
          quantidade: number
          tipo: string
          valor_total: number | null
          valor_unitario: number
        }
        Insert: {
          appointment_id: string
          created_at?: string
          descricao: string
          id?: string
          quantidade?: number
          tipo: string
          valor_total?: number | null
          valor_unitario?: number
        }
        Update: {
          appointment_id?: string
          created_at?: string
          descricao?: string
          id?: string
          quantidade?: number
          tipo?: string
          valor_total?: number | null
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "appointment_items_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_items_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "pendencias_view"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_payments: {
        Row: {
          appointment_id: string
          created_at: string
          data_pagamento: string | null
          id: string
          observacao: string | null
          payment_method_id: string
          valor: number
        }
        Insert: {
          appointment_id: string
          created_at?: string
          data_pagamento?: string | null
          id?: string
          observacao?: string | null
          payment_method_id: string
          valor: number
        }
        Update: {
          appointment_id?: string
          created_at?: string
          data_pagamento?: string | null
          id?: string
          observacao?: string | null
          payment_method_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "appointment_payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "pendencias_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          clinic_id: string | null
          comprovante_path: string | null
          created_at: string
          created_by: string | null
          data_atendimento: string
          data_pagamento: string | null
          deleted_at: string | null
          id: string
          nf_data_emissao: string | null
          nf_emitida: boolean
          nf_enviada: boolean
          nf_numero: string | null
          nf_pdf_path: string | null
          numero_interno: string | null
          obs_financeiras: string | null
          observacoes: string | null
          pago: boolean
          payment_method_id: string | null
          pet: string
          status: string
          tutor: string
          updated_at: string
          valor: number | null
          valor_recebido: number | null
        }
        Insert: {
          clinic_id?: string | null
          comprovante_path?: string | null
          created_at?: string
          created_by?: string | null
          data_atendimento: string
          data_pagamento?: string | null
          deleted_at?: string | null
          id?: string
          nf_data_emissao?: string | null
          nf_emitida?: boolean
          nf_enviada?: boolean
          nf_numero?: string | null
          nf_pdf_path?: string | null
          numero_interno?: string | null
          obs_financeiras?: string | null
          observacoes?: string | null
          pago?: boolean
          payment_method_id?: string | null
          pet: string
          status?: string
          tutor: string
          updated_at?: string
          valor?: number | null
          valor_recebido?: number | null
        }
        Update: {
          clinic_id?: string | null
          comprovante_path?: string | null
          created_at?: string
          created_by?: string | null
          data_atendimento?: string
          data_pagamento?: string | null
          deleted_at?: string | null
          id?: string
          nf_data_emissao?: string | null
          nf_emitida?: boolean
          nf_enviada?: boolean
          nf_numero?: string | null
          nf_pdf_path?: string | null
          numero_interno?: string | null
          obs_financeiras?: string | null
          observacoes?: string | null
          pago?: boolean
          payment_method_id?: string | null
          pet?: string
          status?: string
          tutor?: string
          updated_at?: string
          valor?: number | null
          valor_recebido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acao: string
          criado_em: string
          diff: Json | null
          id: string
          ip: string | null
          registro_id: string | null
          tabela: string
          user_id: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          diff?: Json | null
          id?: string
          ip?: string | null
          registro_id?: string | null
          tabela: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          diff?: Json | null
          id?: string
          ip?: string | null
          registro_id?: string | null
          tabela?: string
          user_id?: string | null
        }
        Relationships: []
      }
      clinics: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          percentual_repasse: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          percentual_repasse?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          percentual_repasse?: number
          updated_at?: string
        }
        Relationships: []
      }
      login_events: {
        Row: {
          criado_em: string
          id: string
          ip: string | null
          tipo: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          criado_em?: string
          id?: string
          ip?: string | null
          tipo: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          criado_em?: string
          id?: string
          ip?: string | null
          tipo?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          id: string
          nome?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      pendencias_view: {
        Row: {
          clinic_id: string | null
          comprovante_path: string | null
          data_atendimento: string | null
          id: string | null
          nf_emitida: boolean | null
          numero_interno: string | null
          pago: boolean | null
          pet: string | null
          tipo_pendencia: string | null
          tutor: string | null
          valor: number | null
        }
        Insert: {
          clinic_id?: string | null
          comprovante_path?: string | null
          data_atendimento?: string | null
          id?: string | null
          nf_emitida?: boolean | null
          numero_interno?: string | null
          pago?: boolean | null
          pet?: string | null
          tipo_pendencia?: never
          tutor?: string | null
          valor?: number | null
        }
        Update: {
          clinic_id?: string | null
          comprovante_path?: string | null
          data_atendimento?: string | null
          id?: string | null
          nf_emitida?: boolean | null
          numero_interno?: string | null
          pago?: boolean | null
          pet?: string | null
          tipo_pendencia?: never
          tutor?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_any_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "vet"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vet"],
    },
  },
} as const
