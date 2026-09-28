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
      activities: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["activity_direction"]
          document_id: string | null
          duration_sec: number | null
          enrichment_request_id: string | null
          external_id: string | null
          follow_up_date: string | null
          from_number: string | null
          id: string
          import_id: string | null
          mail_piece_id: string | null
          match_status: Database["public"]["Enums"]["match_status"]
          note_id: string | null
          occurred_at: string
          offer_id: string | null
          outcome: string | null
          owner_id: string | null
          payload: Json
          property_id: string | null
          summary: string | null
          task_id: string | null
          to_number: string | null
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["activity_direction"]
          document_id?: string | null
          duration_sec?: number | null
          enrichment_request_id?: string | null
          external_id?: string | null
          follow_up_date?: string | null
          from_number?: string | null
          id?: string
          import_id?: string | null
          mail_piece_id?: string | null
          match_status?: Database["public"]["Enums"]["match_status"]
          note_id?: string | null
          occurred_at?: string
          offer_id?: string | null
          outcome?: string | null
          owner_id?: string | null
          payload?: Json
          property_id?: string | null
          summary?: string | null
          task_id?: string | null
          to_number?: string | null
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["activity_direction"]
          document_id?: string | null
          duration_sec?: number | null
          enrichment_request_id?: string | null
          external_id?: string | null
          follow_up_date?: string | null
          from_number?: string | null
          id?: string
          import_id?: string | null
          mail_piece_id?: string | null
          match_status?: Database["public"]["Enums"]["match_status"]
          note_id?: string | null
          occurred_at?: string
          offer_id?: string | null
          outcome?: string | null
          owner_id?: string | null
          payload?: Json
          property_id?: string | null
          summary?: string | null
          task_id?: string | null
          to_number?: string | null
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_enrichment_request_id_fkey"
            columns: ["enrichment_request_id"]
            isOneToOne: false
            referencedRelation: "enrichment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_mail_piece_id_fkey"
            columns: ["mail_piece_id"]
            isOneToOne: false
            referencedRelation: "mail_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      api_cost_ledger: {
        Row: {
          cost_usd: number
          created_at: string
          created_by: string | null
          id: number
          meta: Json
          occurred_at: string
          provider: Database["public"]["Enums"]["enrichment_provider"]
          request_id: string | null
          tokens: number | null
          units: number
          updated_at: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          id?: never
          meta?: Json
          occurred_at?: string
          provider: Database["public"]["Enums"]["enrichment_provider"]
          request_id?: string | null
          tokens?: number | null
          units?: number
          updated_at?: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          id?: never
          meta?: Json
          occurred_at?: string
          provider?: Database["public"]["Enums"]["enrichment_provider"]
          request_id?: string | null
          tokens?: number | null
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_cost_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_cost_ledger_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "enrichment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          allowed_email_domain: string
          auction_alert_days: number
          bootstrap_admin_emails: string[]
          created_at: string
          created_by: string | null
          id: boolean
          overall_monthly_budget_usd: number
          red_flag_mom_growth_pct: number
          red_flag_monthly_spend_usd: number
          red_flag_tokens_per_tx: number
          scoring_weights: Json
          stale_lead_days: number
          updated_at: string
        }
        Insert: {
          allowed_email_domain?: string
          auction_alert_days?: number
          bootstrap_admin_emails?: string[]
          created_at?: string
          created_by?: string | null
          id?: boolean
          overall_monthly_budget_usd?: number
          red_flag_mom_growth_pct?: number
          red_flag_monthly_spend_usd?: number
          red_flag_tokens_per_tx?: number
          scoring_weights?: Json
          stale_lead_days?: number
          updated_at?: string
        }
        Update: {
          allowed_email_domain?: string
          auction_alert_days?: number
          bootstrap_admin_emails?: string[]
          created_at?: string
          created_by?: string | null
          id?: boolean
          overall_monthly_budget_usd?: number
          red_flag_mom_growth_pct?: number
          red_flag_monthly_spend_usd?: number
          red_flag_tokens_per_tx?: number
          scoring_weights?: Json
          stale_lead_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          at: string
          change_source: string
          changed_fields: string[] | null
          id: number
          new: Json | null
          old: Json | null
          property_id: string | null
          row_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          at?: string
          change_source?: string
          changed_fields?: string[] | null
          id?: never
          new?: Json | null
          old?: Json | null
          property_id?: string | null
          row_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          change_source?: string
          changed_fields?: string[] | null
          id?: never
          new?: Json | null
          old?: Json | null
          property_id?: string | null
          row_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          consent: boolean
          consent_at: string | null
          consent_method: string | null
          created_at: string
          created_by: string | null
          dnc_checked_at: string | null
          dnc_hit: boolean | null
          do_not_contact: boolean
          email: string | null
          id: string
          name: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          phone_e164: string | null
          phone_type: Database["public"]["Enums"]["phone_type"] | null
          source: Database["public"]["Enums"]["contact_source"]
          title: string | null
          updated_at: string
          verified: boolean
        }
        Insert: {
          consent?: boolean
          consent_at?: string | null
          consent_method?: string | null
          created_at?: string
          created_by?: string | null
          dnc_checked_at?: string | null
          dnc_hit?: boolean | null
          do_not_contact?: boolean
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_e164?: string | null
          phone_type?: Database["public"]["Enums"]["phone_type"] | null
          source?: Database["public"]["Enums"]["contact_source"]
          title?: string | null
          updated_at?: string
          verified?: boolean
        }
        Update: {
          consent?: boolean
          consent_at?: string | null
          consent_method?: string | null
          created_at?: string
          created_by?: string | null
          dnc_checked_at?: string | null
          dnc_hit?: boolean | null
          do_not_contact?: boolean
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          phone_e164?: string | null
          phone_type?: Database["public"]["Enums"]["phone_type"] | null
          source?: Database["public"]["Enums"]["contact_source"]
          title?: string | null
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      dd_template_items: {
        Row: {
          created_at: string
          created_by: string | null
          help_text: string | null
          id: string
          label: string
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          help_text?: string | null
          id?: string
          label: string
          sort_order: number
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          help_text?: string | null
          id?: string
          label?: string
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dd_template_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dd_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "dd_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      dd_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dd_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      do_not_contact: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          phone_e164: string | null
          reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          phone_e164?: string | null
          reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          phone_e164?: string | null
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "do_not_contact_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          doc_type: Database["public"]["Enums"]["doc_type"]
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          note_id: string | null
          property_id: string
          size_bytes: number | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          note_id?: string | null
          property_id: string
          size_bytes?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          note_id?: string | null
          property_id?: string
          size_bytes?: number | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_availability: {
        Row: {
          availability_date: string
          driver_id: number
          id: number
          is_available: boolean | null
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          availability_date: string
          driver_id: number
          id: number
          is_available?: boolean | null
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          availability_date?: string
          driver_id?: number
          id?: number
          is_available?: boolean | null
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_availability_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_multi_customer_tracking: {
        Row: {
          broker_1_customer: string | null
          broker_1_name: string | null
          broker_2_customer: string | null
          broker_2_name: string | null
          driver_id: number
          flagged_date: string | null
          id: number
          notes: string | null
          shipment_overlap_dates: unknown
          trucking_company_1_id: number
          trucking_company_2_id: number
        }
        Insert: {
          broker_1_customer?: string | null
          broker_1_name?: string | null
          broker_2_customer?: string | null
          broker_2_name?: string | null
          driver_id: number
          flagged_date?: string | null
          id: number
          notes?: string | null
          shipment_overlap_dates?: unknown
          trucking_company_1_id: number
          trucking_company_2_id: number
        }
        Update: {
          broker_1_customer?: string | null
          broker_1_name?: string | null
          broker_2_customer?: string | null
          broker_2_name?: string | null
          driver_id?: number
          flagged_date?: string | null
          id?: number
          notes?: string | null
          shipment_overlap_dates?: unknown
          trucking_company_1_id?: number
          trucking_company_2_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_multi_customer_tracking_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_multi_customer_tracking_trucking_company_1_id_fkey"
            columns: ["trucking_company_1_id"]
            isOneToOne: false
            referencedRelation: "trucking_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_multi_customer_tracking_trucking_company_2_id_fkey"
            columns: ["trucking_company_2_id"]
            isOneToOne: false
            referencedRelation: "trucking_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          cdl_expiry_date: string | null
          cdl_image_url: string | null
          cdl_number: string
          created_at: string | null
          email: string | null
          face_photo_url: string | null
          first_name: string
          id: number
          last_name: string
          phone_number: string | null
          trucking_company_id: number | null
          updated_at: string | null
        }
        Insert: {
          cdl_expiry_date?: string | null
          cdl_image_url?: string | null
          cdl_number: string
          created_at?: string | null
          email?: string | null
          face_photo_url?: string | null
          first_name: string
          id: number
          last_name: string
          phone_number?: string | null
          trucking_company_id?: number | null
          updated_at?: string | null
        }
        Update: {
          cdl_expiry_date?: string | null
          cdl_image_url?: string | null
          cdl_number?: string
          created_at?: string | null
          email?: string | null
          face_photo_url?: string | null
          first_name?: string
          id?: number
          last_name?: string
          phone_number?: string | null
          trucking_company_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_trucking_company_id_fkey"
            columns: ["trucking_company_id"]
            isOneToOne: false
            referencedRelation: "trucking_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      due_diligence_items: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          due_date: string | null
          id: string
          label: string
          notes: string | null
          owner_id: string | null
          property_id: string
          sort_order: number
          status: Database["public"]["Enums"]["dd_status"]
          template_item_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          due_date?: string | null
          id?: string
          label: string
          notes?: string | null
          owner_id?: string | null
          property_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["dd_status"]
          template_item_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          due_date?: string | null
          id?: string
          label?: string
          notes?: string | null
          owner_id?: string | null
          property_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["dd_status"]
          template_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "due_diligence_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "due_diligence_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "due_diligence_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "due_diligence_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "due_diligence_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "due_diligence_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "dd_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_requests: {
        Row: {
          actual_cost: number | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          credits_used: number | null
          decided_at: string | null
          error: string | null
          estimated_cost: number
          estimated_credits: number | null
          finished_at: string | null
          id: string
          owner_id: string | null
          params: Json
          property_id: string | null
          provider: Database["public"]["Enums"]["enrichment_provider"]
          rejection_reason: string | null
          requested_by: string | null
          result: Json | null
          reveal: Database["public"]["Enums"]["reveal_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["enrichment_status"]
          updated_at: string
        }
        Insert: {
          actual_cost?: number | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credits_used?: number | null
          decided_at?: string | null
          error?: string | null
          estimated_cost?: number
          estimated_credits?: number | null
          finished_at?: string | null
          id?: string
          owner_id?: string | null
          params?: Json
          property_id?: string | null
          provider: Database["public"]["Enums"]["enrichment_provider"]
          rejection_reason?: string | null
          requested_by?: string | null
          result?: Json | null
          reveal?: Database["public"]["Enums"]["reveal_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["enrichment_status"]
          updated_at?: string
        }
        Update: {
          actual_cost?: number | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credits_used?: number | null
          decided_at?: string | null
          error?: string | null
          estimated_cost?: number
          estimated_credits?: number | null
          finished_at?: string | null
          id?: string
          owner_id?: string | null
          params?: Json
          property_id?: string | null
          provider?: Database["public"]["Enums"]["enrichment_provider"]
          rejection_reason?: string | null
          requested_by?: string | null
          result?: Json | null
          reveal?: Database["public"]["Enums"]["reveal_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["enrichment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          action: Database["public"]["Enums"]["import_row_action"] | null
          apn: string | null
          committed_at: string | null
          conflict_resolution: Json | null
          conflicts: Json | null
          created_at: string
          created_by: string | null
          error: string | null
          id: number
          import_id: string
          mapped: Json | null
          property_id: string | null
          raw: Json
          row_number: number
          updated_at: string
        }
        Insert: {
          action?: Database["public"]["Enums"]["import_row_action"] | null
          apn?: string | null
          committed_at?: string | null
          conflict_resolution?: Json | null
          conflicts?: Json | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: never
          import_id: string
          mapped?: Json | null
          property_id?: string | null
          raw: Json
          row_number: number
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["import_row_action"] | null
          apn?: string | null
          committed_at?: string | null
          conflict_resolution?: Json | null
          conflicts?: Json | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: never
          import_id?: string
          mapped?: Json | null
          property_id?: string | null
          raw?: Json
          row_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          column_mapping: Json
          committed_at: string | null
          conflicts: number
          county: Database["public"]["Enums"]["county_name"] | null
          created: number
          created_at: string
          created_by: string | null
          errors: Json
          file_name: string
          file_path: string | null
          header_row: number
          id: string
          imported_by: string | null
          matched: number
          row_count: number
          sheet_name: string | null
          source_type: Database["public"]["Enums"]["import_source_type"]
          status: Database["public"]["Enums"]["import_status"]
          updated: number
          updated_at: string
        }
        Insert: {
          column_mapping?: Json
          committed_at?: string | null
          conflicts?: number
          county?: Database["public"]["Enums"]["county_name"] | null
          created?: number
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_name: string
          file_path?: string | null
          header_row?: number
          id?: string
          imported_by?: string | null
          matched?: number
          row_count?: number
          sheet_name?: string | null
          source_type?: Database["public"]["Enums"]["import_source_type"]
          status?: Database["public"]["Enums"]["import_status"]
          updated?: number
          updated_at?: string
        }
        Update: {
          column_mapping?: Json
          committed_at?: string | null
          conflicts?: number
          county?: Database["public"]["Enums"]["county_name"] | null
          created?: number
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_name?: string
          file_path?: string | null
          header_row?: number
          id?: string
          imported_by?: string | null
          matched?: number
          row_count?: number
          sheet_name?: string | null
          source_type?: Database["public"]["Enums"]["import_source_type"]
          status?: Database["public"]["Enums"]["import_status"]
          updated?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_statuses: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          created_by: string | null
          is_terminal: boolean
          is_won: boolean
          key: string
          label: string
          requires_contract_doc: boolean
          requires_offer: boolean
          requires_reason: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          is_terminal?: boolean
          is_won?: boolean
          key: string
          label: string
          requires_contract_doc?: boolean
          requires_offer?: boolean
          requires_reason?: boolean
          sort_order: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          is_terminal?: boolean
          is_won?: boolean
          key?: string
          label?: string
          requires_contract_doc?: boolean
          requires_offer?: boolean
          requires_reason?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          saved_view_id: string | null
          sent_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          template_id: string | null
          tracking_phone: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          saved_view_id?: string | null
          sent_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          tracking_phone?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          saved_view_id?: string | null
          sent_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          template_id?: string | null
          tracking_phone?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mail_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_campaigns_saved_view_fk"
            columns: ["saved_view_id"]
            isOneToOne: false
            referencedRelation: "saved_views"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "mail_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_pieces: {
        Row: {
          address_snapshot: Json
          campaign_id: string
          cost: number | null
          created_at: string
          created_by: string | null
          id: string
          owner_id: string | null
          property_id: string
          responded: boolean
          responded_at: string | null
          response: string | null
          sent_date: string | null
          status: Database["public"]["Enums"]["mail_piece_status"]
          template_id: string | null
          tracking_phone: string | null
          updated_at: string
          vendor: string | null
          vendor_ref: string | null
        }
        Insert: {
          address_snapshot?: Json
          campaign_id: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          owner_id?: string | null
          property_id: string
          responded?: boolean
          responded_at?: string | null
          response?: string | null
          sent_date?: string | null
          status?: Database["public"]["Enums"]["mail_piece_status"]
          template_id?: string | null
          tracking_phone?: string | null
          updated_at?: string
          vendor?: string | null
          vendor_ref?: string | null
        }
        Update: {
          address_snapshot?: Json
          campaign_id?: string
          cost?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          owner_id?: string | null
          property_id?: string
          responded?: boolean
          responded_at?: string | null
          response?: string | null
          sent_date?: string | null
          status?: Database["public"]["Enums"]["mail_piece_status"]
          template_id?: string | null
          tracking_phone?: string | null
          updated_at?: string
          vendor?: string | null
          vendor_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mail_pieces_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mail_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_pieces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_pieces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_pieces_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_pieces_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mail_pieces_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "mail_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_templates: {
        Row: {
          active: boolean
          body: string
          created_at: string
          created_by: string | null
          format: Database["public"]["Enums"]["mail_format"]
          id: string
          merge_fields: string[]
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          created_by?: string | null
          format?: Database["public"]["Enums"]["mail_format"]
          id?: string
          merge_fields?: string[]
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          format?: Database["public"]["Enums"]["mail_format"]
          id?: string
          merge_fields?: string[]
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          mentions: string[]
          parent_id: string | null
          pinned: boolean
          property_id: string
          updated_at: string
          visibility: Database["public"]["Enums"]["note_visibility"]
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string
          id?: string
          mentions?: string[]
          parent_id?: string | null
          pinned?: boolean
          property_id: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          mentions?: string[]
          parent_id?: string | null
          pinned?: boolean
          property_id?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          emailed_at: string | null
          id: string
          kind: string
          link: string | null
          property_id: string | null
          read_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          emailed_at?: string | null
          id?: string
          kind: string
          link?: string | null
          property_id?: string | null
          read_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          emailed_at?: string | null
          id?: string
          kind?: string
          link?: string | null
          property_id?: string | null
          read_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          document_id: string | null
          expires_on: string | null
          id: string
          property_id: string
          response: string | null
          response_date: string | null
          sent_date: string | null
          status: Database["public"]["Enums"]["offer_status"]
          terms: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          expires_on?: string | null
          id?: string
          property_id: string
          response?: string | null
          response_date?: string | null
          sent_date?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          terms?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          expires_on?: string | null
          id?: string
          property_id?: string
          response?: string | null
          response_date?: string | null
          sent_date?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
        ]
      }
      owners: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mailing_address: string | null
          mailing_city: string | null
          mailing_state: string | null
          mailing_zip: string | null
          merged_into_id: string | null
          name: string
          name_normalized: string | null
          owner_type: Database["public"]["Enums"]["owner_type"]
          sos_details: Json | null
          sos_entity_number: string | null
          sos_status: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          merged_into_id?: string | null
          name: string
          name_normalized?: string | null
          owner_type?: Database["public"]["Enums"]["owner_type"]
          sos_details?: Json | null
          sos_entity_number?: string | null
          sos_status?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mailing_address?: string | null
          mailing_city?: string | null
          mailing_state?: string | null
          mailing_zip?: string | null
          merged_into_id?: string | null
          name?: string
          name_normalized?: string | null
          owner_type?: Database["public"]["Enums"]["owner_type"]
          sos_details?: Json | null
          sos_entity_number?: string | null
          sos_status?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owners_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          notify_email: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          notify_email?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          notify_email?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          acres: number | null
          alt_use_score: number | null
          apn: string
          asking_price: number | null
          assignee_id: string | null
          big_rig_access_score: number | null
          centroid: unknown
          corridor_zone: Database["public"]["Enums"]["corridor_zone"]
          county: Database["public"]["Enums"]["county_name"]
          created_at: string
          created_by: string | null
          dead_reason: Database["public"]["Enums"]["dead_reason"] | null
          dead_reason_note: string | null
          distance_to_i10_mi: number | null
          distance_to_interchange_mi: number | null
          dnc_flag: boolean
          ev_score: number | null
          field_sources: Json
          geom: unknown
          id: string
          is_absentee: boolean | null
          is_entity_owner: boolean | null
          is_vacant: boolean | null
          land_use: string | null
          land_value: number | null
          last_activity_at: string | null
          lead_status: string
          legal_description: string | null
          location_method: Database["public"]["Enums"]["location_method"] | null
          map_book: string | null
          mortgages_note: string | null
          nearest_interchange: string | null
          nearest_interchange_id: string | null
          overall_score: number | null
          plss_range: string | null
          plss_section: string | null
          plss_township: string | null
          priority: number | null
          property_description: string | null
          situs_address: string | null
          situs_city: string | null
          source_list: Database["public"]["Enums"]["source_list"]
          source_year: number | null
          status_changed_at: string
          strategy: string | null
          strategy_locked: boolean
          structure_value: number | null
          tags: string[]
          tax_rate_area: string | null
          thomas_bros_grid: string | null
          thomas_bros_page: string | null
          updated_at: string
          why_this_property: string | null
          zip: string | null
          zoning: string | null
          zoning_hint: string | null
          zoning_verified: boolean
          zoning_verified_at: string | null
          zoning_verified_source: string | null
          zoning_verified_value: string | null
        }
        Insert: {
          acres?: number | null
          alt_use_score?: number | null
          apn: string
          asking_price?: number | null
          assignee_id?: string | null
          big_rig_access_score?: number | null
          centroid?: unknown
          corridor_zone?: Database["public"]["Enums"]["corridor_zone"]
          county?: Database["public"]["Enums"]["county_name"]
          created_at?: string
          created_by?: string | null
          dead_reason?: Database["public"]["Enums"]["dead_reason"] | null
          dead_reason_note?: string | null
          distance_to_i10_mi?: number | null
          distance_to_interchange_mi?: number | null
          dnc_flag?: boolean
          ev_score?: number | null
          field_sources?: Json
          geom?: unknown
          id?: string
          is_absentee?: boolean | null
          is_entity_owner?: boolean | null
          is_vacant?: boolean | null
          land_use?: string | null
          land_value?: number | null
          last_activity_at?: string | null
          lead_status?: string
          legal_description?: string | null
          location_method?:
            | Database["public"]["Enums"]["location_method"]
            | null
          map_book?: string | null
          mortgages_note?: string | null
          nearest_interchange?: string | null
          nearest_interchange_id?: string | null
          overall_score?: number | null
          plss_range?: string | null
          plss_section?: string | null
          plss_township?: string | null
          priority?: number | null
          property_description?: string | null
          situs_address?: string | null
          situs_city?: string | null
          source_list?: Database["public"]["Enums"]["source_list"]
          source_year?: number | null
          status_changed_at?: string
          strategy?: string | null
          strategy_locked?: boolean
          structure_value?: number | null
          tags?: string[]
          tax_rate_area?: string | null
          thomas_bros_grid?: string | null
          thomas_bros_page?: string | null
          updated_at?: string
          why_this_property?: string | null
          zip?: string | null
          zoning?: string | null
          zoning_hint?: string | null
          zoning_verified?: boolean
          zoning_verified_at?: string | null
          zoning_verified_source?: string | null
          zoning_verified_value?: string | null
        }
        Update: {
          acres?: number | null
          alt_use_score?: number | null
          apn?: string
          asking_price?: number | null
          assignee_id?: string | null
          big_rig_access_score?: number | null
          centroid?: unknown
          corridor_zone?: Database["public"]["Enums"]["corridor_zone"]
          county?: Database["public"]["Enums"]["county_name"]
          created_at?: string
          created_by?: string | null
          dead_reason?: Database["public"]["Enums"]["dead_reason"] | null
          dead_reason_note?: string | null
          distance_to_i10_mi?: number | null
          distance_to_interchange_mi?: number | null
          dnc_flag?: boolean
          ev_score?: number | null
          field_sources?: Json
          geom?: unknown
          id?: string
          is_absentee?: boolean | null
          is_entity_owner?: boolean | null
          is_vacant?: boolean | null
          land_use?: string | null
          land_value?: number | null
          last_activity_at?: string | null
          lead_status?: string
          legal_description?: string | null
          location_method?:
            | Database["public"]["Enums"]["location_method"]
            | null
          map_book?: string | null
          mortgages_note?: string | null
          nearest_interchange?: string | null
          nearest_interchange_id?: string | null
          overall_score?: number | null
          plss_range?: string | null
          plss_section?: string | null
          plss_township?: string | null
          priority?: number | null
          property_description?: string | null
          situs_address?: string | null
          situs_city?: string | null
          source_list?: Database["public"]["Enums"]["source_list"]
          source_year?: number | null
          status_changed_at?: string
          strategy?: string | null
          strategy_locked?: boolean
          structure_value?: number | null
          tags?: string[]
          tax_rate_area?: string | null
          thomas_bros_grid?: string | null
          thomas_bros_page?: string | null
          updated_at?: string
          why_this_property?: string | null
          zip?: string | null
          zoning?: string | null
          zoning_hint?: string | null
          zoning_verified?: boolean
          zoning_verified_at?: string | null
          zoning_verified_source?: string | null
          zoning_verified_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_lead_status_fkey"
            columns: ["lead_status"]
            isOneToOne: false
            referencedRelation: "lead_statuses"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "properties_strategy_fkey"
            columns: ["strategy"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["key"]
          },
        ]
      }
      property_owners: {
        Row: {
          created_at: string
          created_by: string | null
          owner_id: string
          ownership_pct: number | null
          property_id: string
          role: Database["public"]["Enums"]["owner_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          owner_id: string
          ownership_pct?: number | null
          property_id: string
          role?: Database["public"]["Enums"]["owner_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          owner_id?: string
          ownership_pct?: number | null
          property_id?: string
          role?: Database["public"]["Enums"]["owner_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_owners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owners_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owners_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owners_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_settings: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          is_paid: boolean
          key_last4: string | null
          last_test_ok: boolean | null
          last_tested_at: string | null
          monthly_budget_usd: number | null
          provider: Database["public"]["Enums"]["enrichment_provider"]
          unit_cost_usd: number | null
          updated_at: string
          vault_secret_id: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          is_paid?: boolean
          key_last4?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          monthly_budget_usd?: number | null
          provider: Database["public"]["Enums"]["enrichment_provider"]
          unit_cost_usd?: number | null
          updated_at?: string
          vault_secret_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          is_paid?: boolean
          key_last4?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          monthly_budget_usd?: number | null
          provider?: Database["public"]["Enums"]["enrichment_provider"]
          unit_cost_usd?: number | null
          updated_at?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_comps: {
        Row: {
          acres: number | null
          apn: string | null
          centroid: unknown
          county: Database["public"]["Enums"]["county_name"]
          created_at: string
          created_by: string | null
          id: string
          import_id: string | null
          sale_date: string | null
          sale_price: number | null
          situs_city: string | null
          source: string | null
          updated_at: string
          zoning: string | null
        }
        Insert: {
          acres?: number | null
          apn?: string | null
          centroid?: unknown
          county: Database["public"]["Enums"]["county_name"]
          created_at?: string
          created_by?: string | null
          id?: string
          import_id?: string | null
          sale_date?: string | null
          sale_price?: number | null
          situs_city?: string | null
          source?: string | null
          updated_at?: string
          zoning?: string | null
        }
        Update: {
          acres?: number | null
          apn?: string | null
          centroid?: unknown
          county?: Database["public"]["Enums"]["county_name"]
          created_at?: string
          created_by?: string | null
          id?: string
          import_id?: string | null
          sale_date?: string | null
          sale_price?: number | null
          situs_city?: string | null
          source?: string | null
          updated_at?: string
          zoning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_comps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_comps_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_views: {
        Row: {
          columns: Json
          created_at: string
          created_by: string | null
          filters: Json
          id: string
          name: string
          page: string
          shared: boolean
          sort: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          columns?: Json
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          name: string
          page?: string
          shared?: boolean
          sort?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          columns?: Json
          created_at?: string
          created_by?: string | null
          filters?: Json
          id?: string
          name?: string
          page?: string
          shared?: boolean
          sort?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_views_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          booking_time: string
          broker_customer_id: string | null
          broker_name: string | null
          completion_date: string | null
          created_at: string | null
          destination_location: string
          driver_id: number
          id: number
          origin_location: string
          shipment_date: string
          status: string | null
          trucking_company_id: number
          updated_at: string | null
        }
        Insert: {
          booking_time: string
          broker_customer_id?: string | null
          broker_name?: string | null
          completion_date?: string | null
          created_at?: string | null
          destination_location: string
          driver_id: number
          id: number
          origin_location: string
          shipment_date: string
          status?: string | null
          trucking_company_id: number
          updated_at?: string | null
        }
        Update: {
          booking_time?: string
          broker_customer_id?: string | null
          broker_name?: string | null
          completion_date?: string | null
          created_at?: string | null
          destination_location?: string
          driver_id?: number
          id?: number
          origin_location?: string
          shipment_date?: string
          status?: string | null
          trucking_company_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_trucking_company_id_fkey"
            columns: ["trucking_company_id"]
            isOneToOne: false
            referencedRelation: "trucking_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      site_metrics: {
        Row: {
          aadt_point_id: string | null
          aadt_source: string | null
          aadt_year: number | null
          br_both_directions: number | null
          br_interchange: number | null
          br_notes: Json
          br_pull_through: number | null
          br_route_quality: number | null
          circuit: string | null
          created_at: string
          created_by: string | null
          dirt_road_only: boolean | null
          pca_cost: number | null
          pca_ordered: boolean
          pca_ordered_at: string | null
          pca_result: string | null
          pca_result_document_id: string | null
          property_id: string
          sce_capacity_notes: string | null
          substation: string | null
          total_aadt: number | null
          truck_aadt: number | null
          updated_at: string
          utilities_on_site: boolean | null
          utility_provider: string | null
        }
        Insert: {
          aadt_point_id?: string | null
          aadt_source?: string | null
          aadt_year?: number | null
          br_both_directions?: number | null
          br_interchange?: number | null
          br_notes?: Json
          br_pull_through?: number | null
          br_route_quality?: number | null
          circuit?: string | null
          created_at?: string
          created_by?: string | null
          dirt_road_only?: boolean | null
          pca_cost?: number | null
          pca_ordered?: boolean
          pca_ordered_at?: string | null
          pca_result?: string | null
          pca_result_document_id?: string | null
          property_id: string
          sce_capacity_notes?: string | null
          substation?: string | null
          total_aadt?: number | null
          truck_aadt?: number | null
          updated_at?: string
          utilities_on_site?: boolean | null
          utility_provider?: string | null
        }
        Update: {
          aadt_point_id?: string | null
          aadt_source?: string | null
          aadt_year?: number | null
          br_both_directions?: number | null
          br_interchange?: number | null
          br_notes?: Json
          br_pull_through?: number | null
          br_route_quality?: number | null
          circuit?: string | null
          created_at?: string
          created_by?: string | null
          dirt_road_only?: boolean | null
          pca_cost?: number | null
          pca_ordered?: boolean
          pca_ordered_at?: string | null
          pca_result?: string | null
          pca_result_document_id?: string | null
          property_id?: string
          sce_capacity_notes?: string | null
          substation?: string | null
          total_aadt?: number | null
          truck_aadt?: number | null
          updated_at?: string
          utilities_on_site?: boolean | null
          utility_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_metrics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_metrics_pca_result_document_id_fkey"
            columns: ["pca_result_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_metrics_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_metrics_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          key: string
          label: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_rules: {
        Row: {
          conditions: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          name: string
          sort_order: number
          strategy_key: string
          updated_at: string
        }
        Insert: {
          conditions?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name: string
          sort_order: number
          strategy_key: string
          updated_at?: string
        }
        Update: {
          conditions?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          name?: string
          sort_order?: number
          strategy_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_rules_strategy_key_fkey"
            columns: ["strategy_key"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["key"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          category: Database["public"]["Enums"]["task_category"]
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: number
          property_id: string | null
          sort_order: number | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          category?: Database["public"]["Enums"]["task_category"]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: number
          property_id?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          category?: Database["public"]["Enums"]["task_category"]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: number
          property_id?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_status: {
        Row: {
          advalorem: number | null
          auction_date: string | null
          auction_status: Database["public"]["Enums"]["auction_status"]
          auction_url: string | null
          created_at: string
          created_by: string | null
          id: string
          import_id: string | null
          owed_to_land_ratio: number | null
          power_to_sell_date: string | null
          property_id: string
          redemption_amount: number | null
          snapshot_date: string
          source: string
          specials: number | null
          updated_at: string
          years_in_default: number | null
        }
        Insert: {
          advalorem?: number | null
          auction_date?: string | null
          auction_status?: Database["public"]["Enums"]["auction_status"]
          auction_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_id?: string | null
          owed_to_land_ratio?: number | null
          power_to_sell_date?: string | null
          property_id: string
          redemption_amount?: number | null
          snapshot_date: string
          source: string
          specials?: number | null
          updated_at?: string
          years_in_default?: number | null
        }
        Update: {
          advalorem?: number | null
          auction_date?: string | null
          auction_status?: Database["public"]["Enums"]["auction_status"]
          auction_url?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_id?: string | null
          owed_to_land_ratio?: number | null
          power_to_sell_date?: string | null
          property_id?: string
          redemption_amount?: number | null
          snapshot_date?: string
          source?: string
          specials?: number | null
          updated_at?: string
          years_in_default?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_status_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_status_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_status_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "property_grid"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_numbers: {
        Row: {
          active: boolean
          campaign_id: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          phone_e164: string
          twilio_sid: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          phone_e164: string
          twilio_sid?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          phone_e164?: string
          twilio_sid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_numbers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mail_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_numbers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trucking_companies: {
        Row: {
          broker_affiliation: string | null
          company_email: string | null
          company_metadata: Json | null
          company_name: string
          company_phone: string | null
          created_at: string | null
          id: number
          updated_at: string | null
        }
        Insert: {
          broker_affiliation?: string | null
          company_email?: string | null
          company_metadata?: Json | null
          company_name: string
          company_phone?: string | null
          created_at?: string | null
          id: number
          updated_at?: string | null
        }
        Update: {
          broker_affiliation?: string | null
          company_email?: string | null
          company_metadata?: Json | null
          company_name?: string
          company_phone?: string | null
          created_at?: string | null
          id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      property_grid: {
        Row: {
          acres: number | null
          alt_use_score: number | null
          apn: string | null
          apn_display: string | null
          asking_price: number | null
          assignee_id: string | null
          assignee_name: string | null
          auction_date: string | null
          auction_status: Database["public"]["Enums"]["auction_status"] | null
          big_rig_access_score: number | null
          corridor_zone: Database["public"]["Enums"]["corridor_zone"] | null
          county: Database["public"]["Enums"]["county_name"] | null
          created_at: string | null
          distance_to_i10_mi: number | null
          distance_to_interchange_mi: number | null
          dnc_flag: boolean | null
          ev_score: number | null
          has_email: boolean | null
          has_phone: boolean | null
          id: string | null
          is_absentee: boolean | null
          is_entity_owner: boolean | null
          is_vacant: boolean | null
          land_use: string | null
          land_value: number | null
          last_activity_at: string | null
          lat: number | null
          lead_status: string | null
          lng: number | null
          location_method: Database["public"]["Enums"]["location_method"] | null
          nearest_interchange: string | null
          next_task_due: string | null
          next_task_title: string | null
          overall_score: number | null
          owed_to_land_ratio: number | null
          owner_count: number | null
          owner_names: string | null
          power_to_sell_date: string | null
          priority: number | null
          redemption_amount: number | null
          situs_address: string | null
          situs_city: string | null
          source_list: Database["public"]["Enums"]["source_list"] | null
          status_changed_at: string | null
          strategy: string | null
          structure_value: number | null
          tags: string[] | null
          updated_at: string | null
          years_in_default: number | null
          zip: string | null
          zoning: string | null
          zoning_verified: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_lead_status_fkey"
            columns: ["lead_status"]
            isOneToOne: false
            referencedRelation: "lead_statuses"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "properties_strategy_fkey"
            columns: ["strategy"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["key"]
          },
        ]
      }
    }
    Functions: {
      commit_import: {
        Args: { p_import_id: string; p_limit?: number }
        Returns: Json
      }
      corridor_zone_for: {
        Args: { p_miles: number }
        Returns: Database["public"]["Enums"]["corridor_zone"]
      }
      dashboard_stats: { Args: never; Returns: Json }
      decide_enrichment: {
        Args: { p_approve: boolean; p_ids: string[]; p_reason?: string }
        Returns: {
          actual_cost: number | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          credits_used: number | null
          decided_at: string | null
          error: string | null
          estimated_cost: number
          estimated_credits: number | null
          finished_at: string | null
          id: string
          owner_id: string | null
          params: Json
          property_id: string | null
          provider: Database["public"]["Enums"]["enrichment_provider"]
          rejection_reason: string | null
          requested_by: string | null
          result: Json | null
          reveal: Database["public"]["Enums"]["reveal_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["enrichment_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "enrichment_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ensure_dd_items: {
        Args: { p_property_id: string }
        Returns: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          document_id: string | null
          due_date: string | null
          id: string
          label: string
          notes: string | null
          owner_id: string | null
          property_id: string
          sort_order: number
          status: Database["public"]["Enums"]["dd_status"]
          template_item_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "due_diligence_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      format_apn: {
        Args: {
          p_apn: string
          p_county: Database["public"]["Enums"]["county_name"]
        }
        Returns: string
      }
      month_spend: {
        Args: {
          p_provider?: Database["public"]["Enums"]["enrichment_provider"]
        }
        Returns: number
      }
      normalize_apn: { Args: { p_apn: string }; Returns: string }
      recompute_property_geo: { Args: never; Returns: number }
      request_enrichment: {
        Args: {
          p_owner_id?: string
          p_params?: Json
          p_property_id?: string
          p_provider: Database["public"]["Enums"]["enrichment_provider"]
          p_reveal?: Database["public"]["Enums"]["reveal_type"]
          p_units?: number
        }
        Returns: {
          actual_cost: number | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          credits_used: number | null
          decided_at: string | null
          error: string | null
          estimated_cost: number
          estimated_credits: number | null
          finished_at: string | null
          id: string
          owner_id: string | null
          params: Json
          property_id: string | null
          provider: Database["public"]["Enums"]["enrichment_provider"]
          rejection_reason: string | null
          requested_by: string | null
          result: Json | null
          reveal: Database["public"]["Enums"]["reveal_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["enrichment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "enrichment_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_global: {
        Args: { lim?: number; q: string }
        Returns: {
          id: string
          kind: string
          label: string
          property_id: string
          sublabel: string
        }[]
      }
    }
    Enums: {
      activity_direction: "inbound" | "outbound" | "internal"
      activity_type:
        | "note"
        | "call"
        | "sms"
        | "email"
        | "mail_sent"
        | "site_visit"
        | "offer"
        | "status_change"
        | "enrichment"
        | "import"
        | "document"
        | "task"
      app_role: "admin" | "acquisitions" | "analyst" | "viewer"
      auction_status: "none" | "scheduled" | "sold" | "redeemed" | "withdrawn"
      campaign_status: "draft" | "scheduled" | "sending" | "sent" | "closed"
      contact_source:
        | "county"
        | "sos"
        | "apollo"
        | "inbound_call"
        | "manual"
        | "vendor"
        | "n8n"
      corridor_zone: "i10_corridor" | "i10_near" | "other"
      county_name:
        | "riverside"
        | "san_bernardino"
        | "los_angeles"
        | "imperial"
        | "kern"
        | "other"
      dd_status:
        | "not_started"
        | "in_progress"
        | "done"
        | "issue"
        | "not_applicable"
      dead_reason:
        | "not_selling"
        | "price"
        | "title_issue"
        | "access"
        | "zoning"
        | "sold_at_auction"
        | "other"
      doc_type:
        | "deed"
        | "title_report"
        | "zoning_letter"
        | "sce_capacity_report"
        | "survey"
        | "photo"
        | "offer"
        | "loi"
        | "contract"
        | "other"
      enrichment_provider:
        | "sos"
        | "apollo"
        | "skip_trace"
        | "regrid"
        | "gis"
        | "caltrans"
        | "scag"
        | "n8n"
        | "mail_vendor"
        | "twilio"
        | "llm"
      enrichment_status:
        | "requested"
        | "approved"
        | "running"
        | "done"
        | "failed"
        | "rejected"
      import_row_action:
        | "create"
        | "update"
        | "unchanged"
        | "conflict"
        | "error"
        | "skip"
      import_source_type:
        | "tax_default_inventory"
        | "i10_leads_workbook"
        | "off_market_list"
        | "sold_comps"
        | "delinquent_list"
        | "assessment_roll"
        | "sales_db"
        | "property_characteristics"
        | "google_sheet_leads"
        | "google_sheet_tasks"
        | "generic"
      import_status:
        | "uploaded"
        | "mapped"
        | "previewed"
        | "committing"
        | "committed"
        | "failed"
        | "cancelled"
      location_method:
        | "gis_polygon"
        | "plss_estimate"
        | "mapbook_avg"
        | "geocode"
      mail_format: "letter" | "postcard"
      mail_piece_status:
        | "queued"
        | "sent"
        | "delivered"
        | "returned"
        | "cancelled"
      match_status: "matched" | "unmatched" | "triaged" | "ignored"
      note_visibility: "team" | "private"
      offer_status:
        | "draft"
        | "sent"
        | "countered"
        | "accepted"
        | "rejected"
        | "expired"
        | "withdrawn"
      owner_role: "owner" | "trustee" | "officer" | "agent"
      owner_type:
        | "individual"
        | "entity"
        | "trust"
        | "estate"
        | "government"
        | "unknown"
      phone_type: "mobile" | "landline" | "voip" | "unknown"
      reveal_type: "none" | "email" | "phone"
      source_list:
        | "off_market_list"
        | "tax_default"
        | "delinquent_list"
        | "assessment_roll"
        | "google_sheet"
        | "manual"
        | "other"
      task_category:
        | "parcel_check"
        | "sce"
        | "traffic"
        | "deal"
        | "lead"
        | "gis_api"
        | "legal"
        | "outreach"
        | "other"
      task_status:
        | "not_started"
        | "in_progress"
        | "waiting"
        | "done"
        | "blocked"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      activity_direction: ["inbound", "outbound", "internal"],
      activity_type: [
        "note",
        "call",
        "sms",
        "email",
        "mail_sent",
        "site_visit",
        "offer",
        "status_change",
        "enrichment",
        "import",
        "document",
        "task",
      ],
      app_role: ["admin", "acquisitions", "analyst", "viewer"],
      auction_status: ["none", "scheduled", "sold", "redeemed", "withdrawn"],
      campaign_status: ["draft", "scheduled", "sending", "sent", "closed"],
      contact_source: [
        "county",
        "sos",
        "apollo",
        "inbound_call",
        "manual",
        "vendor",
        "n8n",
      ],
      corridor_zone: ["i10_corridor", "i10_near", "other"],
      county_name: [
        "riverside",
        "san_bernardino",
        "los_angeles",
        "imperial",
        "kern",
        "other",
      ],
      dd_status: [
        "not_started",
        "in_progress",
        "done",
        "issue",
        "not_applicable",
      ],
      dead_reason: [
        "not_selling",
        "price",
        "title_issue",
        "access",
        "zoning",
        "sold_at_auction",
        "other",
      ],
      doc_type: [
        "deed",
        "title_report",
        "zoning_letter",
        "sce_capacity_report",
        "survey",
        "photo",
        "offer",
        "loi",
        "contract",
        "other",
      ],
      enrichment_provider: [
        "sos",
        "apollo",
        "skip_trace",
        "regrid",
        "gis",
        "caltrans",
        "scag",
        "n8n",
        "mail_vendor",
        "twilio",
        "llm",
      ],
      enrichment_status: [
        "requested",
        "approved",
        "running",
        "done",
        "failed",
        "rejected",
      ],
      import_row_action: [
        "create",
        "update",
        "unchanged",
        "conflict",
        "error",
        "skip",
      ],
      import_source_type: [
        "tax_default_inventory",
        "i10_leads_workbook",
        "off_market_list",
        "sold_comps",
        "delinquent_list",
        "assessment_roll",
        "sales_db",
        "property_characteristics",
        "google_sheet_leads",
        "google_sheet_tasks",
        "generic",
      ],
      import_status: [
        "uploaded",
        "mapped",
        "previewed",
        "committing",
        "committed",
        "failed",
        "cancelled",
      ],
      location_method: [
        "gis_polygon",
        "plss_estimate",
        "mapbook_avg",
        "geocode",
      ],
      mail_format: ["letter", "postcard"],
      mail_piece_status: [
        "queued",
        "sent",
        "delivered",
        "returned",
        "cancelled",
      ],
      match_status: ["matched", "unmatched", "triaged", "ignored"],
      note_visibility: ["team", "private"],
      offer_status: [
        "draft",
        "sent",
        "countered",
        "accepted",
        "rejected",
        "expired",
        "withdrawn",
      ],
      owner_role: ["owner", "trustee", "officer", "agent"],
      owner_type: [
        "individual",
        "entity",
        "trust",
        "estate",
        "government",
        "unknown",
      ],
      phone_type: ["mobile", "landline", "voip", "unknown"],
      reveal_type: ["none", "email", "phone"],
      source_list: [
        "off_market_list",
        "tax_default",
        "delinquent_list",
        "assessment_roll",
        "google_sheet",
        "manual",
        "other",
      ],
      task_category: [
        "parcel_check",
        "sce",
        "traffic",
        "deal",
        "lead",
        "gis_api",
        "legal",
        "outreach",
        "other",
      ],
      task_status: ["not_started", "in_progress", "waiting", "done", "blocked"],
    },
  },
} as const
