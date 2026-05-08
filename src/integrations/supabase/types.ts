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
      lead_activities: {
        Row: {
          contact_method: Database["public"]["Enums"]["contact_method"] | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_id: string
          metadata: Json | null
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contact_method?: Database["public"]["Enums"]["contact_method"] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contact_method?: Database["public"]["Enums"]["contact_method"] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          lead_id: string
          mime_type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          lead_id: string
          mime_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          lead_id?: string
          mime_type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_attachments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          additional_contacts: Json
          city: string | null
          company_or_person: string
          contact_method: Database["public"]["Enums"]["contact_method"] | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          estimated_value: number | null
          funnel_id: string
          has_been_contacted: boolean
          id: string
          next_follow_up: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          position: number
          segment: string | null
          segment_other: string | null
          source: string | null
          service_details: string | null
          service_types: string[]
          stage_id: string
          tax_regime: string | null
          temperature: Database["public"]["Enums"]["lead_temperature"]
          uf: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          additional_contacts?: Json
          city?: string | null
          company_or_person: string
          contact_method?: Database["public"]["Enums"]["contact_method"] | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_value?: number | null
          funnel_id: string
          has_been_contacted?: boolean
          id?: string
          next_follow_up?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          position?: number
          segment?: string | null
          segment_other?: string | null
          source?: string | null
          service_details?: string | null
          service_types?: string[]
          stage_id: string
          tax_regime?: string | null
          temperature?: Database["public"]["Enums"]["lead_temperature"]
          uf?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          additional_contacts?: Json
          city?: string | null
          company_or_person?: string
          contact_method?: Database["public"]["Enums"]["contact_method"] | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_value?: number | null
          funnel_id?: string
          has_been_contacted?: boolean
          id?: string
          next_follow_up?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          position?: number
          segment?: string | null
          segment_other?: string | null
          source?: string | null
          service_details?: string | null
          service_types?: string[]
          stage_id?: string
          tax_regime?: string | null
          temperature?: Database["public"]["Enums"]["lead_temperature"]
          uf?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      funnels: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          funnel_id: string
          id: string
          is_lost: boolean
          is_won: boolean
          key: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          funnel_id: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          key: string
          name: string
          position: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          funnel_id?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          key?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
        profiles: {
          Row: {
            access_status: Database["public"]["Enums"]["user_access_status"]
            avatar_url: string | null
            can_receive_leads: boolean
            created_at: string
            email: string | null
            full_name: string | null
            has_all_funnel_access: boolean
            id: string
            is_active: boolean
            notification_preferences: Json
            notifications_last_read_at: string | null
            updated_at: string
          }
          Insert: {
            access_status?: Database["public"]["Enums"]["user_access_status"]
            avatar_url?: string | null
            can_receive_leads?: boolean
            created_at?: string
            email?: string | null
            full_name?: string | null
            has_all_funnel_access?: boolean
            id: string
            is_active?: boolean
            notification_preferences?: Json
            notifications_last_read_at?: string | null
            updated_at?: string
          }
          Update: {
            access_status?: Database["public"]["Enums"]["user_access_status"]
            avatar_url?: string | null
            can_receive_leads?: boolean
            created_at?: string
            email?: string | null
            full_name?: string | null
            has_all_funnel_access?: boolean
            id?: string
            is_active?: boolean
            notification_preferences?: Json
            notifications_last_read_at?: string | null
            updated_at?: string
          }
          Relationships: []
        }
      user_funnel_access: {
        Row: {
          created_at: string
          funnel_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          funnel_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          funnel_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_funnel_access_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
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
          role?: Database["public"]["Enums"]["app_role"]
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
      [_ in never]: never
    }
    Functions: {
      current_user_can_manage_team: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      current_user_can_access_lead: {
        Args: {
          _lead_id: string
        }
        Returns: boolean
      }
      current_user_has_funnel_access: {
        Args: {
          _funnel_id: string
        }
        Returns: boolean
      }
      current_user_has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
        }
        Returns: boolean
      }
      current_user_has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      current_user_is_active: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      current_user_status: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["user_access_status"]
      }
      create_funnel: {
        Args: {
          _name: string
        }
        Returns: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      list_assignable_users: {
        Args: {
          _funnel_id?: string
        }
        Returns: {
          access_status: Database["public"]["Enums"]["user_access_status"]
          avatar_url: string | null
          can_receive_leads: boolean
          created_at: string
          email: string | null
          full_name: string | null
          has_all_funnel_access: boolean
          id: string
          is_active: boolean
          updated_at: string
        }[]
      }
      list_funnels_with_access: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          has_access: boolean
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }[]
      }
      set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
      }
      set_user_status: {
        Args: {
          _status: Database["public"]["Enums"]["user_access_status"]
          _target_user_id: string
        }
        Returns: {
          access_status: Database["public"]["Enums"]["user_access_status"]
          avatar_url: string | null
          can_receive_leads: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
      }
      set_user_funnel_scope: {
        Args: {
          _funnel_id?: string
          _funnel_ids?: string[]
          _has_all_funnel_access: boolean
          _target_user_id: string
        }
        Returns: {
          access_status: Database["public"]["Enums"]["user_access_status"]
          avatar_url: string | null
          can_receive_leads: boolean
          created_at: string
          email: string | null
          full_name: string | null
          has_all_funnel_access: boolean
          id: string
          is_active: boolean
          updated_at: string
        }
      }
      user_has_funnel_access: {
        Args: {
          _funnel_id: string
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      activity_type:
        | "stage_change"
        | "note_added"
        | "contact_logged"
        | "attachment_added"
        | "lead_created"
        | "lead_updated"
        | "owner_change"
      app_role: "admin" | "user" | "gestor" | "consultor" | "visualizador"
      user_access_status: "pending" | "active" | "suspended" | "inactive"
      contact_method:
        | "whatsapp"
        | "ligacao"
        | "email"
        | "reuniao"
        | "indicacao"
        | "outro"
      lead_temperature: "frio" | "morno" | "quente"
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
      activity_type: [
        "stage_change",
        "note_added",
        "contact_logged",
        "attachment_added",
        "lead_created",
        "lead_updated",
        "owner_change",
      ],
      app_role: ["admin", "user", "gestor", "consultor", "visualizador"],
      user_access_status: ["pending", "active", "suspended", "inactive"],
      contact_method: [
        "whatsapp",
        "ligacao",
        "email",
        "reuniao",
        "indicacao",
        "outro",
      ],
      lead_temperature: ["frio", "morno", "quente"],
    },
  },
} as const
