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
      activity_events: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          organization_id: string | null
          payload: Json
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          organization_id?: string | null
          payload?: Json
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          organization_id?: string | null
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_optimization_suggestions: {
        Row: {
          agent_id: string
          applied_at: string | null
          applied_by: string | null
          based_on_count: number | null
          created_at: string
          id: string
          organization_id: string
          rationale: string | null
          status: string
          suggestion_text: string
          suggestion_type: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          applied_at?: string | null
          applied_by?: string | null
          based_on_count?: number | null
          created_at?: string
          id?: string
          organization_id: string
          rationale?: string | null
          status?: string
          suggestion_text: string
          suggestion_type: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          applied_at?: string | null
          applied_by?: string | null
          based_on_count?: number | null
          created_at?: string
          id?: string
          organization_id?: string
          rationale?: string | null
          status?: string
          suggestion_text?: string
          suggestion_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_optimization_suggestions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_templates: {
        Row: {
          agent_type: string
          base_prompt: string
          channel_priority: string | null
          created_at: string
          default_config: Json
          default_trainings: Json
          description: string | null
          icon: string | null
          id: string
          is_global: boolean
          name: string
          slug: string
          updated_at: string
          use_case: string | null
        }
        Insert: {
          agent_type: string
          base_prompt: string
          channel_priority?: string | null
          created_at?: string
          default_config?: Json
          default_trainings?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_global?: boolean
          name: string
          slug: string
          updated_at?: string
          use_case?: string | null
        }
        Update: {
          agent_type?: string
          base_prompt?: string
          channel_priority?: string | null
          created_at?: string
          default_config?: Json
          default_trainings?: Json
          description?: string | null
          icon?: string | null
          id?: string
          is_global?: boolean
          name?: string
          slug?: string
          updated_at?: string
          use_case?: string | null
        }
        Relationships: []
      }
      agent_trainings: {
        Row: {
          active: boolean | null
          agent_id: string
          category: string | null
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          organization_id: string | null
          priority: number | null
          status: string
          storage_path: string | null
          title: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          active?: boolean | null
          agent_id: string
          category?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          organization_id?: string | null
          priority?: number | null
          status?: string
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          active?: boolean | null
          agent_id?: string
          category?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          organization_id?: string | null
          priority?: number | null
          status?: string
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_trainings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_trainings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          active: boolean
          agent_type: string | null
          allow_emojis: boolean | null
          allow_reminders: boolean | null
          authority_arguments: Json | null
          avatar_url: string | null
          base_prompt: string | null
          business_hours: Json | null
          calendar_booking_enabled: boolean | null
          campaign_goal: string | null
          channel_priority: string | null
          channels: Json | null
          communication_style: string | null
          company: string | null
          context_multiplier: number | null
          created_at: string
          created_by: string | null
          default_calendar_user_id: string | null
          description: string | null
          failure_criteria: Json | null
          handoff_rules: Json | null
          id: string
          inactivity_actions: Json | null
          initial_greeting: string | null
          intents: Json | null
          interaction_limit: number | null
          knowledge_categories: string[]
          knowledge_enabled: boolean
          limit_action: string | null
          llm_model: string | null
          llm_provider: string | null
          max_context_documents: number
          name: string
          objection_handling: Json | null
          objections: string | null
          orbit_sync_enabled: boolean | null
          organization_id: string | null
          personality: string | null
          product: string | null
          qualification_questions: Json | null
          response_delay_seconds: number | null
          restrict_topics: boolean | null
          role_title: string | null
          search_threshold: number
          sign_responses: boolean | null
          signature: string | null
          smart_training_search: boolean | null
          split_messages: boolean | null
          success_criteria: Json | null
          template_slug: string | null
          timezone: string | null
          training_notes: string | null
          transfer_rules: Json | null
          transfer_summary: boolean | null
          transfer_to_human: boolean | null
          updated_at: string
          use_case: string | null
          voice_config: Json | null
          voice_enabled: boolean | null
          webhooks: Json | null
          whatsapp_audio_enabled: boolean | null
        }
        Insert: {
          active?: boolean
          agent_type?: string | null
          allow_emojis?: boolean | null
          allow_reminders?: boolean | null
          authority_arguments?: Json | null
          avatar_url?: string | null
          base_prompt?: string | null
          business_hours?: Json | null
          calendar_booking_enabled?: boolean | null
          campaign_goal?: string | null
          channel_priority?: string | null
          channels?: Json | null
          communication_style?: string | null
          company?: string | null
          context_multiplier?: number | null
          created_at?: string
          created_by?: string | null
          default_calendar_user_id?: string | null
          description?: string | null
          failure_criteria?: Json | null
          handoff_rules?: Json | null
          id?: string
          inactivity_actions?: Json | null
          initial_greeting?: string | null
          intents?: Json | null
          interaction_limit?: number | null
          knowledge_categories?: string[]
          knowledge_enabled?: boolean
          limit_action?: string | null
          llm_model?: string | null
          llm_provider?: string | null
          max_context_documents?: number
          name: string
          objection_handling?: Json | null
          objections?: string | null
          orbit_sync_enabled?: boolean | null
          organization_id?: string | null
          personality?: string | null
          product?: string | null
          qualification_questions?: Json | null
          response_delay_seconds?: number | null
          restrict_topics?: boolean | null
          role_title?: string | null
          search_threshold?: number
          sign_responses?: boolean | null
          signature?: string | null
          smart_training_search?: boolean | null
          split_messages?: boolean | null
          success_criteria?: Json | null
          template_slug?: string | null
          timezone?: string | null
          training_notes?: string | null
          transfer_rules?: Json | null
          transfer_summary?: boolean | null
          transfer_to_human?: boolean | null
          updated_at?: string
          use_case?: string | null
          voice_config?: Json | null
          voice_enabled?: boolean | null
          webhooks?: Json | null
          whatsapp_audio_enabled?: boolean | null
        }
        Update: {
          active?: boolean
          agent_type?: string | null
          allow_emojis?: boolean | null
          allow_reminders?: boolean | null
          authority_arguments?: Json | null
          avatar_url?: string | null
          base_prompt?: string | null
          business_hours?: Json | null
          calendar_booking_enabled?: boolean | null
          campaign_goal?: string | null
          channel_priority?: string | null
          channels?: Json | null
          communication_style?: string | null
          company?: string | null
          context_multiplier?: number | null
          created_at?: string
          created_by?: string | null
          default_calendar_user_id?: string | null
          description?: string | null
          failure_criteria?: Json | null
          handoff_rules?: Json | null
          id?: string
          inactivity_actions?: Json | null
          initial_greeting?: string | null
          intents?: Json | null
          interaction_limit?: number | null
          knowledge_categories?: string[]
          knowledge_enabled?: boolean
          limit_action?: string | null
          llm_model?: string | null
          llm_provider?: string | null
          max_context_documents?: number
          name?: string
          objection_handling?: Json | null
          objections?: string | null
          orbit_sync_enabled?: boolean | null
          organization_id?: string | null
          personality?: string | null
          product?: string | null
          qualification_questions?: Json | null
          response_delay_seconds?: number | null
          restrict_topics?: boolean | null
          role_title?: string | null
          search_threshold?: number
          sign_responses?: boolean | null
          signature?: string | null
          smart_training_search?: boolean | null
          split_messages?: boolean | null
          success_criteria?: Json | null
          template_slug?: string | null
          timezone?: string | null
          training_notes?: string | null
          transfer_rules?: Json | null
          transfer_summary?: boolean | null
          transfer_to_human?: boolean | null
          updated_at?: string
          use_case?: string | null
          voice_config?: Json | null
          voice_enabled?: boolean | null
          webhooks?: Json | null
          whatsapp_audio_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_default_calendar_user_id_fkey"
            columns: ["default_calendar_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          ab_enabled: boolean
          agent_name: string | null
          agent_objections: string | null
          agent_personality: string | null
          agent_product: string | null
          apify_actor_id: string | null
          apify_token: string | null
          auto_cadence_default_agent_id: string | null
          auto_cadence_enabled: boolean
          booking_link: string | null
          default_calendar_fallback_user_id: string | null
          fallback_sender_email: string | null
          fallback_sender_name: string | null
          google_oauth_client_id: string | null
          google_oauth_client_secret: string | null
          icp_cidades: string[]
          icp_segmentos: string[]
          inbound_after_hours_message: string | null
          inbound_business_hours_enabled: boolean
          inbound_create_lead_automatically: boolean
          inbound_default_agent_id: string | null
          inbound_enabled: boolean
          inbound_handoff_user_id: string | null
          inbound_pause_cadence_on_message: boolean
          inbound_support_mode_enabled: boolean
          inbound_token: string | null
          jcs_data_engine_enabled: boolean
          llm_model: string
          lost_recover_enabled: boolean
          max_inbound_interactions: number
          meeting_buffer_min: number
          meeting_default_duration_min: number
          meeting_lunch_end: string
          meeting_lunch_start: string
          meeting_max_days_ahead: number
          meeting_min_lead_time_min: number
          meeting_working_days: number[]
          meeting_working_end: string
          meeting_working_start: string
          ms_oauth_client_id: string | null
          ms_oauth_client_secret: string | null
          ms_oauth_tenant: string | null
          organization_id: string
          pre_icp_scoring_enabled: boolean
          qualification_framework: string
          reengage_after_days: number
          reengage_enabled: boolean
          send_days: number[]
          sip_display_name: string | null
          sip_domain: string | null
          sip_password: string | null
          sip_server: string | null
          sip_username: string | null
          sip_ws_url: string | null
          smart_flow_ui_enabled: boolean
          smart_prospect_engine_enabled: boolean
          smtp_auth_enabled: boolean
          smtp_from: string | null
          smtp_from_email: string | null
          smtp_from_name: string | null
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_use_ssl: boolean
          smtp_use_tls: boolean
          smtp_user: string | null
          tenant_provider_settings_enabled: boolean
          twilio_from_number: string | null
          universal_icp_enabled: boolean
          updated_at: string
          whatsapp_api_key: string | null
          whatsapp_daily_limit: number
          whatsapp_instance_name: string | null
          whatsapp_instance_url: string | null
          whatsapp_min_interval_seconds: number
          whatsapp_send_window_end: number
          whatsapp_send_window_start: number
          whatsapp_webhook_token: string | null
        }
        Insert: {
          ab_enabled?: boolean
          agent_name?: string | null
          agent_objections?: string | null
          agent_personality?: string | null
          agent_product?: string | null
          apify_actor_id?: string | null
          apify_token?: string | null
          auto_cadence_default_agent_id?: string | null
          auto_cadence_enabled?: boolean
          booking_link?: string | null
          default_calendar_fallback_user_id?: string | null
          fallback_sender_email?: string | null
          fallback_sender_name?: string | null
          google_oauth_client_id?: string | null
          google_oauth_client_secret?: string | null
          icp_cidades?: string[]
          icp_segmentos?: string[]
          inbound_after_hours_message?: string | null
          inbound_business_hours_enabled?: boolean
          inbound_create_lead_automatically?: boolean
          inbound_default_agent_id?: string | null
          inbound_enabled?: boolean
          inbound_handoff_user_id?: string | null
          inbound_pause_cadence_on_message?: boolean
          inbound_support_mode_enabled?: boolean
          inbound_token?: string | null
          jcs_data_engine_enabled?: boolean
          llm_model?: string
          lost_recover_enabled?: boolean
          max_inbound_interactions?: number
          meeting_buffer_min?: number
          meeting_default_duration_min?: number
          meeting_lunch_end?: string
          meeting_lunch_start?: string
          meeting_max_days_ahead?: number
          meeting_min_lead_time_min?: number
          meeting_working_days?: number[]
          meeting_working_end?: string
          meeting_working_start?: string
          ms_oauth_client_id?: string | null
          ms_oauth_client_secret?: string | null
          ms_oauth_tenant?: string | null
          organization_id: string
          pre_icp_scoring_enabled?: boolean
          qualification_framework?: string
          reengage_after_days?: number
          reengage_enabled?: boolean
          send_days?: number[]
          sip_display_name?: string | null
          sip_domain?: string | null
          sip_password?: string | null
          sip_server?: string | null
          sip_username?: string | null
          sip_ws_url?: string | null
          smart_flow_ui_enabled?: boolean
          smart_prospect_engine_enabled?: boolean
          smtp_auth_enabled?: boolean
          smtp_from?: string | null
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_use_ssl?: boolean
          smtp_use_tls?: boolean
          smtp_user?: string | null
          tenant_provider_settings_enabled?: boolean
          twilio_from_number?: string | null
          universal_icp_enabled?: boolean
          updated_at?: string
          whatsapp_api_key?: string | null
          whatsapp_daily_limit?: number
          whatsapp_instance_name?: string | null
          whatsapp_instance_url?: string | null
          whatsapp_min_interval_seconds?: number
          whatsapp_send_window_end?: number
          whatsapp_send_window_start?: number
          whatsapp_webhook_token?: string | null
        }
        Update: {
          ab_enabled?: boolean
          agent_name?: string | null
          agent_objections?: string | null
          agent_personality?: string | null
          agent_product?: string | null
          apify_actor_id?: string | null
          apify_token?: string | null
          auto_cadence_default_agent_id?: string | null
          auto_cadence_enabled?: boolean
          booking_link?: string | null
          default_calendar_fallback_user_id?: string | null
          fallback_sender_email?: string | null
          fallback_sender_name?: string | null
          google_oauth_client_id?: string | null
          google_oauth_client_secret?: string | null
          icp_cidades?: string[]
          icp_segmentos?: string[]
          inbound_after_hours_message?: string | null
          inbound_business_hours_enabled?: boolean
          inbound_create_lead_automatically?: boolean
          inbound_default_agent_id?: string | null
          inbound_enabled?: boolean
          inbound_handoff_user_id?: string | null
          inbound_pause_cadence_on_message?: boolean
          inbound_support_mode_enabled?: boolean
          inbound_token?: string | null
          jcs_data_engine_enabled?: boolean
          llm_model?: string
          lost_recover_enabled?: boolean
          max_inbound_interactions?: number
          meeting_buffer_min?: number
          meeting_default_duration_min?: number
          meeting_lunch_end?: string
          meeting_lunch_start?: string
          meeting_max_days_ahead?: number
          meeting_min_lead_time_min?: number
          meeting_working_days?: number[]
          meeting_working_end?: string
          meeting_working_start?: string
          ms_oauth_client_id?: string | null
          ms_oauth_client_secret?: string | null
          ms_oauth_tenant?: string | null
          organization_id?: string
          pre_icp_scoring_enabled?: boolean
          qualification_framework?: string
          reengage_after_days?: number
          reengage_enabled?: boolean
          send_days?: number[]
          sip_display_name?: string | null
          sip_domain?: string | null
          sip_password?: string | null
          sip_server?: string | null
          sip_username?: string | null
          sip_ws_url?: string | null
          smart_flow_ui_enabled?: boolean
          smart_prospect_engine_enabled?: boolean
          smtp_auth_enabled?: boolean
          smtp_from?: string | null
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_use_ssl?: boolean
          smtp_use_tls?: boolean
          smtp_user?: string | null
          tenant_provider_settings_enabled?: boolean
          twilio_from_number?: string | null
          universal_icp_enabled?: boolean
          updated_at?: string
          whatsapp_api_key?: string | null
          whatsapp_daily_limit?: number
          whatsapp_instance_name?: string | null
          whatsapp_instance_url?: string | null
          whatsapp_min_interval_seconds?: number
          whatsapp_send_window_end?: number
          whatsapp_send_window_start?: number
          whatsapp_webhook_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_auto_cadence_default_agent_id_fkey"
            columns: ["auto_cadence_default_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_default_calendar_fallback_user_id_fkey"
            columns: ["default_calendar_fallback_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_inbound_default_agent_fk"
            columns: ["inbound_default_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_inbound_handoff_user_fk"
            columns: ["inbound_handoff_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_history: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          invoice_url: string | null
          organization_id: string
          period_end: string | null
          period_start: string | null
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_url?: string | null
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_url?: string | null
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      cadence_variants: {
        Row: {
          active: boolean
          body_template: string
          cadence_day: number
          cadence_id: string | null
          channel: string
          created_at: string
          id: string
          organization_id: string | null
          positive_count: number
          reply_count: number
          sent_count: number
          subject: string | null
          updated_at: string
          variant_key: string
          weight: number
        }
        Insert: {
          active?: boolean
          body_template: string
          cadence_day: number
          cadence_id?: string | null
          channel: string
          created_at?: string
          id?: string
          organization_id?: string | null
          positive_count?: number
          reply_count?: number
          sent_count?: number
          subject?: string | null
          updated_at?: string
          variant_key: string
          weight?: number
        }
        Update: {
          active?: boolean
          body_template?: string
          cadence_day?: number
          cadence_id?: string | null
          channel?: string
          created_at?: string
          id?: string
          organization_id?: string | null
          positive_count?: number
          reply_count?: number
          sent_count?: number
          subject?: string | null
          updated_at?: string
          variant_key?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "cadence_variants_cadence_id_fkey"
            columns: ["cadence_id"]
            isOneToOne: false
            referencedRelation: "cadences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadence_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cadences: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          objective: string | null
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          objective?: string | null
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          objective?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_connections: {
        Row: {
          access_token: string
          buffer_after_min: number
          buffer_before_min: number
          calendar_id: string | null
          created_at: string
          default_duration_min: number
          email: string | null
          enabled: boolean
          expires_at: string | null
          id: string
          needs_reauth: boolean
          organization_id: string
          provider: string
          refresh_token: string | null
          scope: string | null
          timezone: string
          updated_at: string
          user_id: string
          working_hours: Json
        }
        Insert: {
          access_token: string
          buffer_after_min?: number
          buffer_before_min?: number
          calendar_id?: string | null
          created_at?: string
          default_duration_min?: number
          email?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          needs_reauth?: boolean
          organization_id: string
          provider: string
          refresh_token?: string | null
          scope?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
          working_hours?: Json
        }
        Update: {
          access_token?: string
          buffer_after_min?: number
          buffer_before_min?: number
          calendar_id?: string | null
          created_at?: string
          default_duration_min?: number
          email?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          needs_reauth?: boolean
          organization_id?: string
          provider?: string
          refresh_token?: string | null
          scope?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
          working_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "calendar_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      call_attempts: {
        Row: {
          agent_id: string | null
          attempt_no: number
          call_id: string | null
          created_at: string
          error: string | null
          id: string
          lead_id: string
          organization_id: string
          scheduled_at: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          attempt_no?: number
          call_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          lead_id: string
          organization_id: string
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          attempt_no?: number
          call_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          lead_id?: string
          organization_id?: string
          scheduled_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_attempts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_attempts_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_attempts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_id: string | null
          call_quality_score: number | null
          call_status: string | null
          call_type: string
          created_at: string
          direction: string | null
          duration_sec: number | null
          duration_seconds: number | null
          ended_at: string | null
          from_number: string | null
          id: string
          intent: string | null
          lead_id: string
          next_action: string | null
          notes: string | null
          objections_detected: string[] | null
          orbit_synced: boolean
          organization_id: string | null
          qualification_score: number | null
          recording_url: string | null
          status: string | null
          summary: string | null
          to_number: string | null
          transcript: string | null
          twilio_call_sid: string | null
          voice_transcript: Json | null
        }
        Insert: {
          agent_id?: string | null
          call_quality_score?: number | null
          call_status?: string | null
          call_type?: string
          created_at?: string
          direction?: string | null
          duration_sec?: number | null
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          intent?: string | null
          lead_id: string
          next_action?: string | null
          notes?: string | null
          objections_detected?: string[] | null
          orbit_synced?: boolean
          organization_id?: string | null
          qualification_score?: number | null
          recording_url?: string | null
          status?: string | null
          summary?: string | null
          to_number?: string | null
          transcript?: string | null
          twilio_call_sid?: string | null
          voice_transcript?: Json | null
        }
        Update: {
          agent_id?: string | null
          call_quality_score?: number | null
          call_status?: string | null
          call_type?: string
          created_at?: string
          direction?: string | null
          duration_sec?: number | null
          duration_seconds?: number | null
          ended_at?: string | null
          from_number?: string | null
          id?: string
          intent?: string | null
          lead_id?: string
          next_action?: string | null
          notes?: string | null
          objections_detected?: string[] | null
          orbit_synced?: boolean
          organization_id?: string | null
          qualification_score?: number | null
          recording_url?: string | null
          status?: string | null
          summary?: string | null
          to_number?: string | null
          transcript?: string | null
          twilio_call_sid?: string | null
          voice_transcript?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_opportunity_signals: {
        Row: {
          confidence: string
          created_at: string
          evidence: Json
          hypothesis: string
          id: string
          organization_id: string
          prospecting_result_id: string | null
          provider: string | null
          signal_type: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          evidence?: Json
          hypothesis: string
          id?: string
          organization_id: string
          prospecting_result_id?: string | null
          provider?: string | null
          signal_type: string
        }
        Update: {
          confidence?: string
          created_at?: string
          evidence?: Json
          hypothesis?: string
          id?: string
          organization_id?: string
          prospecting_result_id?: string | null
          provider?: string | null
          signal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_opportunity_signals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_opportunity_signals_prospecting_result_id_fkey"
            columns: ["prospecting_result_id"]
            isOneToOne: false
            referencedRelation: "prospecting_results"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_evaluations: {
        Row: {
          agent_id: string | null
          behavior_score: number | null
          call_id: string | null
          channel: string
          commitment_score: number | null
          conversation_id: string | null
          created_at: string
          detected_intent: string | null
          detected_objections: string[] | null
          human_feedback: string | null
          human_feedback_at: string | null
          human_feedback_by: string | null
          human_feedback_reason: string | null
          id: string
          improvement_suggestions: string[] | null
          investigation_score: number | null
          lead_id: string | null
          lead_temperature: string | null
          message_ids: string[] | null
          objection_handling_score: number | null
          opening_score: number | null
          organization_id: string
          overall_score: number | null
          recommended_next_action: string | null
          strengths: string[] | null
          updated_at: string
          value_proposition_score: number | null
          weaknesses: string[] | null
        }
        Insert: {
          agent_id?: string | null
          behavior_score?: number | null
          call_id?: string | null
          channel: string
          commitment_score?: number | null
          conversation_id?: string | null
          created_at?: string
          detected_intent?: string | null
          detected_objections?: string[] | null
          human_feedback?: string | null
          human_feedback_at?: string | null
          human_feedback_by?: string | null
          human_feedback_reason?: string | null
          id?: string
          improvement_suggestions?: string[] | null
          investigation_score?: number | null
          lead_id?: string | null
          lead_temperature?: string | null
          message_ids?: string[] | null
          objection_handling_score?: number | null
          opening_score?: number | null
          organization_id: string
          overall_score?: number | null
          recommended_next_action?: string | null
          strengths?: string[] | null
          updated_at?: string
          value_proposition_score?: number | null
          weaknesses?: string[] | null
        }
        Update: {
          agent_id?: string | null
          behavior_score?: number | null
          call_id?: string | null
          channel?: string
          commitment_score?: number | null
          conversation_id?: string | null
          created_at?: string
          detected_intent?: string | null
          detected_objections?: string[] | null
          human_feedback?: string | null
          human_feedback_at?: string | null
          human_feedback_by?: string | null
          human_feedback_reason?: string | null
          id?: string
          improvement_suggestions?: string[] | null
          investigation_score?: number | null
          lead_id?: string | null
          lead_temperature?: string | null
          message_ids?: string[] | null
          objection_handling_score?: number | null
          opening_score?: number | null
          organization_id?: string
          overall_score?: number | null
          recommended_next_action?: string | null
          strengths?: string[] | null
          updated_at?: string
          value_proposition_score?: number | null
          weaknesses?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_evaluations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_evaluations_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_evaluations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_connections: {
        Row: {
          access_token: string | null
          created_at: string
          email: string | null
          enabled: boolean
          expires_at: string | null
          id: string
          organization_id: string
          provider: string
          refresh_token: string | null
          sender_name: string | null
          signature: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          email?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          organization_id: string
          provider: string
          refresh_token?: string | null
          sender_name?: string | null
          signature?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          email?: string | null
          enabled?: boolean
          expires_at?: string | null
          id?: string
          organization_id?: string
          provider?: string
          refresh_token?: string | null
          sender_name?: string | null
          signature?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      enrichment_cache: {
        Row: {
          created_at: string
          expires_at: string | null
          fetched_at: string
          field: string
          id: string
          key_type: string
          key_value: string
          organization_id: string
          provider: string | null
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          fetched_at?: string
          field: string
          id?: string
          key_type: string
          key_value: string
          organization_id: string
          provider?: string | null
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          fetched_at?: string
          field?: string
          id?: string
          key_type?: string
          key_value?: string
          organization_id?: string
          provider?: string | null
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_cache_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_executions: {
        Row: {
          cancelled_at: string | null
          cost_cents: number
          created_at: string
          created_by: string | null
          error_json: Json | null
          execution_id: string
          finished_at: string | null
          icp_id: string | null
          id: string
          organization_id: string
          plan_json: Json | null
          product_id: string | null
          prospecting_result_id: string | null
          prospecting_search_id: string | null
          result_json: Json | null
          spent_credits: number
          started_at: string | null
          status: string
          strategy: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cost_cents?: number
          created_at?: string
          created_by?: string | null
          error_json?: Json | null
          execution_id: string
          finished_at?: string | null
          icp_id?: string | null
          id?: string
          organization_id: string
          plan_json?: Json | null
          product_id?: string | null
          prospecting_result_id?: string | null
          prospecting_search_id?: string | null
          result_json?: Json | null
          spent_credits?: number
          started_at?: string | null
          status?: string
          strategy?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cost_cents?: number
          created_at?: string
          created_by?: string | null
          error_json?: Json | null
          execution_id?: string
          finished_at?: string | null
          icp_id?: string | null
          id?: string
          organization_id?: string
          plan_json?: Json | null
          product_id?: string | null
          prospecting_result_id?: string | null
          prospecting_search_id?: string | null
          result_json?: Json | null
          spent_credits?: number
          started_at?: string | null
          status?: string
          strategy?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      enrichment_jobs: {
        Row: {
          companies_analyzed: number
          companies_enriched: number
          cost_estimated: number
          created_at: string
          credits_used: number
          good_leads: number
          id: string
          max_companies: number | null
          max_credits: number | null
          metadata: Json
          organization_id: string
          prospecting_search_id: string | null
          rejected_leads: number
          review_leads: number
          status: string
          target_good_leads: number | null
          updated_at: string
        }
        Insert: {
          companies_analyzed?: number
          companies_enriched?: number
          cost_estimated?: number
          created_at?: string
          credits_used?: number
          good_leads?: number
          id?: string
          max_companies?: number | null
          max_credits?: number | null
          metadata?: Json
          organization_id: string
          prospecting_search_id?: string | null
          rejected_leads?: number
          review_leads?: number
          status?: string
          target_good_leads?: number | null
          updated_at?: string
        }
        Update: {
          companies_analyzed?: number
          companies_enriched?: number
          cost_estimated?: number
          created_at?: string
          credits_used?: number
          good_leads?: number
          id?: string
          max_companies?: number | null
          max_credits?: number | null
          metadata?: Json
          organization_id?: string
          prospecting_search_id?: string | null
          rejected_leads?: number
          review_leads?: number
          status?: string
          target_good_leads?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_jobs_prospecting_search_id_fkey"
            columns: ["prospecting_search_id"]
            isOneToOne: false
            referencedRelation: "prospecting_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_steps: {
        Row: {
          cache_hit: boolean
          cost_estimated: number
          created_at: string
          credits_used: number
          enrichment_job_id: string | null
          error_code: string | null
          fields_written: string[] | null
          id: string
          metadata: Json
          operation: string
          organization_id: string
          prospecting_result_id: string | null
          provider: string
          status: string
        }
        Insert: {
          cache_hit?: boolean
          cost_estimated?: number
          created_at?: string
          credits_used?: number
          enrichment_job_id?: string | null
          error_code?: string | null
          fields_written?: string[] | null
          id?: string
          metadata?: Json
          operation: string
          organization_id: string
          prospecting_result_id?: string | null
          provider: string
          status?: string
        }
        Update: {
          cache_hit?: boolean
          cost_estimated?: number
          created_at?: string
          credits_used?: number
          enrichment_job_id?: string | null
          error_code?: string | null
          fields_written?: string[] | null
          id?: string
          metadata?: Json
          operation?: string
          organization_id?: string
          prospecting_result_id?: string | null
          provider?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_steps_enrichment_job_id_fkey"
            columns: ["enrichment_job_id"]
            isOneToOne: false
            referencedRelation: "enrichment_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_steps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_steps_prospecting_result_id_fkey"
            columns: ["prospecting_result_id"]
            isOneToOne: false
            referencedRelation: "prospecting_results"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_criteria_catalog: {
        Row: {
          category: string
          created_at: string
          default_operator: string | null
          description: string | null
          field_key: string
          field_label: string
          field_type: string
          id: string
          is_custom: boolean
          options: Json
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          default_operator?: string | null
          description?: string | null
          field_key: string
          field_label: string
          field_type: string
          id?: string
          is_custom?: boolean
          options?: Json
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          default_operator?: string | null
          description?: string | null
          field_key?: string
          field_label?: string
          field_type?: string
          id?: string
          is_custom?: boolean
          options?: Json
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "icp_criteria_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_rules: {
        Row: {
          category: string
          created_at: string
          disqualifying: boolean
          field_key: string
          field_label: string
          field_type: string
          icp_id: string
          id: string
          operator: string
          order: number
          organization_id: string
          positive_or_negative: string
          required: boolean
          requires_enrichment: boolean
          updated_at: string
          value: Json | null
          weight: number
        }
        Insert: {
          category: string
          created_at?: string
          disqualifying?: boolean
          field_key: string
          field_label: string
          field_type: string
          icp_id: string
          id?: string
          operator: string
          order?: number
          organization_id: string
          positive_or_negative?: string
          required?: boolean
          requires_enrichment?: boolean
          updated_at?: string
          value?: Json | null
          weight?: number
        }
        Update: {
          category?: string
          created_at?: string
          disqualifying?: boolean
          field_key?: string
          field_label?: string
          field_type?: string
          icp_id?: string
          id?: string
          operator?: string
          order?: number
          organization_id?: string
          positive_or_negative?: string
          required?: boolean
          requires_enrichment?: boolean
          updated_at?: string
          value?: Json | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "icp_rules_icp_id_fkey"
            columns: ["icp_id"]
            isOneToOne: false
            referencedRelation: "ideal_customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "icp_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_templates: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_global: boolean
          minimum_score: number
          name: string
          organization_id: string | null
          rules: Json
          slug: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          minimum_score?: number
          name: string
          organization_id?: string | null
          rules?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          minimum_score?: number
          name?: string
          organization_id?: string | null
          rules?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "icp_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ideal_customer_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          criteria_json: Json
          description: string | null
          id: string
          minimum_score: number
          name: string
          organization_id: string
          preliminary_minimum_score: number
          product_or_service: string | null
          source_template_id: string | null
          status: string
          updated_at: string
          weights_json: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria_json?: Json
          description?: string | null
          id?: string
          minimum_score?: number
          name: string
          organization_id: string
          preliminary_minimum_score?: number
          product_or_service?: string | null
          source_template_id?: string | null
          status?: string
          updated_at?: string
          weights_json?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria_json?: Json
          description?: string | null
          id?: string
          minimum_score?: number
          name?: string
          organization_id?: string
          preliminary_minimum_score?: number
          product_or_service?: string | null
          source_template_id?: string | null
          status?: string
          updated_at?: string
          weights_json?: Json
        }
        Relationships: []
      }
      intelligence_credit_events: {
        Row: {
          created_at: string
          credits: number
          id: string
          metadata: Json
          operation: string
          organization_id: string
          prospecting_result_id: string | null
          prospecting_search_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          metadata?: Json
          operation: string
          organization_id: string
          prospecting_result_id?: string | null
          prospecting_search_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          metadata?: Json
          operation?: string
          organization_id?: string
          prospecting_result_id?: string | null
          prospecting_search_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_credit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_credit_events_prospecting_result_id_fkey"
            columns: ["prospecting_result_id"]
            isOneToOne: false
            referencedRelation: "prospecting_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_credit_events_prospecting_search_id_fkey"
            columns: ["prospecting_search_id"]
            isOneToOne: false
            referencedRelation: "prospecting_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          chunk_text: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          organization_id: string
          source_id: string
          token_count: number | null
        }
        Insert: {
          chunk_index?: number
          chunk_text: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          source_id: string
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          source_id?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          category: string
          chunk_count: number
          created_at: string
          created_by: string | null
          description: string | null
          error: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          organization_id: string
          source_type: string
          source_url: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          chunk_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          error?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          organization_id: string
          source_type: string
          source_url?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          chunk_count?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          error?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          organization_id?: string
          source_type?: string
          source_url?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          active_cadence_id: string | null
          agent_id: string | null
          ai_paused: boolean
          ai_paused_at: string | null
          cadence_current_day: number | null
          cadence_day: number
          cadence_paused: boolean
          cadence_started_at: string | null
          cadence_status: string
          cidade: string | null
          cnae: string | null
          cnpj: string | null
          created_at: string
          decisores: Json
          dores: Json
          email: string | null
          engagement_score: number
          estado: string | null
          faturamento_estimado: number | null
          funcionarios_estimado: number | null
          handoff_at: string | null
          handoff_reason: string | null
          human_flagged_at: string | null
          human_reason: string | null
          id: string
          inbound_interactions_count: number
          intent_last: Database["public"]["Enums"]["lead_intent"] | null
          is_customer: boolean
          last_inbound_at: string | null
          last_read_at: string | null
          lifecycle_stage: string | null
          lost_at: string | null
          lost_reason: string | null
          meeting_scheduled_at: string | null
          needs_human: boolean
          nome_fantasia: string | null
          notes: string | null
          oportunidades: Json
          opt_out: boolean
          opt_out_at: string | null
          opt_out_reason: string | null
          orbit_company_id: string | null
          orbit_contact_id: string | null
          orbit_deal_id: string | null
          orbit_pipeline_id: string | null
          orbit_stage_id: string | null
          orbit_sync_error: string | null
          orbit_sync_status: string | null
          orbit_synced_at: string | null
          organization_id: string | null
          owner_id: string | null
          prospecting_search_id: string | null
          qual_ai_touched: boolean | null
          qual_authority: string | null
          qual_budget: string | null
          qual_computers_count: number | null
          qual_decision_maker: string | null
          qual_decision_role: string | null
          qual_estimated_budget: string | null
          qual_has_internal_it: boolean | null
          qual_has_outsourced_it: boolean | null
          qual_human_touched: boolean | null
          qual_interest: string | null
          qual_lost_reason: string | null
          qual_main_pain: string | null
          qual_manual_score: number | null
          qual_need: string | null
          qual_next_step: string | null
          qual_score: number
          qual_seller_notes: string | null
          qual_status: string | null
          qual_timing: string | null
          qual_updated_at: string | null
          qual_updated_by: string | null
          qual_urgency: string | null
          razao_social: string | null
          redes_sociais: Json
          responsible_user_id: string | null
          score: number
          segmento: string | null
          site: string | null
          source: string | null
          source_raw: Json | null
          status: Database["public"]["Enums"]["lead_status"]
          tecnologias: Json
          telefone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          active_cadence_id?: string | null
          agent_id?: string | null
          ai_paused?: boolean
          ai_paused_at?: string | null
          cadence_current_day?: number | null
          cadence_day?: number
          cadence_paused?: boolean
          cadence_started_at?: string | null
          cadence_status?: string
          cidade?: string | null
          cnae?: string | null
          cnpj?: string | null
          created_at?: string
          decisores?: Json
          dores?: Json
          email?: string | null
          engagement_score?: number
          estado?: string | null
          faturamento_estimado?: number | null
          funcionarios_estimado?: number | null
          handoff_at?: string | null
          handoff_reason?: string | null
          human_flagged_at?: string | null
          human_reason?: string | null
          id?: string
          inbound_interactions_count?: number
          intent_last?: Database["public"]["Enums"]["lead_intent"] | null
          is_customer?: boolean
          last_inbound_at?: string | null
          last_read_at?: string | null
          lifecycle_stage?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          meeting_scheduled_at?: string | null
          needs_human?: boolean
          nome_fantasia?: string | null
          notes?: string | null
          oportunidades?: Json
          opt_out?: boolean
          opt_out_at?: string | null
          opt_out_reason?: string | null
          orbit_company_id?: string | null
          orbit_contact_id?: string | null
          orbit_deal_id?: string | null
          orbit_pipeline_id?: string | null
          orbit_stage_id?: string | null
          orbit_sync_error?: string | null
          orbit_sync_status?: string | null
          orbit_synced_at?: string | null
          organization_id?: string | null
          owner_id?: string | null
          prospecting_search_id?: string | null
          qual_ai_touched?: boolean | null
          qual_authority?: string | null
          qual_budget?: string | null
          qual_computers_count?: number | null
          qual_decision_maker?: string | null
          qual_decision_role?: string | null
          qual_estimated_budget?: string | null
          qual_has_internal_it?: boolean | null
          qual_has_outsourced_it?: boolean | null
          qual_human_touched?: boolean | null
          qual_interest?: string | null
          qual_lost_reason?: string | null
          qual_main_pain?: string | null
          qual_manual_score?: number | null
          qual_need?: string | null
          qual_next_step?: string | null
          qual_score?: number
          qual_seller_notes?: string | null
          qual_status?: string | null
          qual_timing?: string | null
          qual_updated_at?: string | null
          qual_updated_by?: string | null
          qual_urgency?: string | null
          razao_social?: string | null
          redes_sociais?: Json
          responsible_user_id?: string | null
          score?: number
          segmento?: string | null
          site?: string | null
          source?: string | null
          source_raw?: Json | null
          status?: Database["public"]["Enums"]["lead_status"]
          tecnologias?: Json
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          active_cadence_id?: string | null
          agent_id?: string | null
          ai_paused?: boolean
          ai_paused_at?: string | null
          cadence_current_day?: number | null
          cadence_day?: number
          cadence_paused?: boolean
          cadence_started_at?: string | null
          cadence_status?: string
          cidade?: string | null
          cnae?: string | null
          cnpj?: string | null
          created_at?: string
          decisores?: Json
          dores?: Json
          email?: string | null
          engagement_score?: number
          estado?: string | null
          faturamento_estimado?: number | null
          funcionarios_estimado?: number | null
          handoff_at?: string | null
          handoff_reason?: string | null
          human_flagged_at?: string | null
          human_reason?: string | null
          id?: string
          inbound_interactions_count?: number
          intent_last?: Database["public"]["Enums"]["lead_intent"] | null
          is_customer?: boolean
          last_inbound_at?: string | null
          last_read_at?: string | null
          lifecycle_stage?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          meeting_scheduled_at?: string | null
          needs_human?: boolean
          nome_fantasia?: string | null
          notes?: string | null
          oportunidades?: Json
          opt_out?: boolean
          opt_out_at?: string | null
          opt_out_reason?: string | null
          orbit_company_id?: string | null
          orbit_contact_id?: string | null
          orbit_deal_id?: string | null
          orbit_pipeline_id?: string | null
          orbit_stage_id?: string | null
          orbit_sync_error?: string | null
          orbit_sync_status?: string | null
          orbit_synced_at?: string | null
          organization_id?: string | null
          owner_id?: string | null
          prospecting_search_id?: string | null
          qual_ai_touched?: boolean | null
          qual_authority?: string | null
          qual_budget?: string | null
          qual_computers_count?: number | null
          qual_decision_maker?: string | null
          qual_decision_role?: string | null
          qual_estimated_budget?: string | null
          qual_has_internal_it?: boolean | null
          qual_has_outsourced_it?: boolean | null
          qual_human_touched?: boolean | null
          qual_interest?: string | null
          qual_lost_reason?: string | null
          qual_main_pain?: string | null
          qual_manual_score?: number | null
          qual_need?: string | null
          qual_next_step?: string | null
          qual_score?: number
          qual_seller_notes?: string | null
          qual_status?: string | null
          qual_timing?: string | null
          qual_updated_at?: string | null
          qual_updated_by?: string | null
          qual_urgency?: string | null
          razao_social?: string | null
          redes_sociais?: Json
          responsible_user_id?: string | null
          score?: number
          segmento?: string | null
          site?: string | null
          source?: string | null
          source_raw?: Json | null
          status?: Database["public"]["Enums"]["lead_status"]
          tecnologias?: Json
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_active_cadence_id_fkey"
            columns: ["active_cadence_id"]
            isOneToOne: false
            referencedRelation: "cadences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_prospecting_search_id_fkey"
            columns: ["prospecting_search_id"]
            isOneToOne: false
            referencedRelation: "prospecting_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_reasons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          label: string
          organization_id: string | null
          recover_after_days: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          label: string
          organization_id?: string | null
          recover_after_days?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          label?: string
          organization_id?: string | null
          recover_after_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "lost_reasons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_favorites: {
        Row: {
          created_at: string
          id: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_favorites_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "marketplace_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_installations: {
        Row: {
          created_at: string
          id: string
          installed_by: string | null
          organization_id: string
          result: Json
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          installed_by?: string | null
          organization_id: string
          result?: Json
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          installed_by?: string | null
          organization_id?: string
          result?: Json
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_installations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_installations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "marketplace_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          organization_id: string | null
          stars: number
          template_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          stars: number
          template_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          stars?: number
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_ratings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_ratings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "marketplace_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_templates: {
        Row: {
          author: string | null
          avg_rating: number
          category: string | null
          channel: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          install_count: number
          is_global: boolean
          is_jcs_official: boolean
          kind: string
          kpis: Json
          name: string
          organization_id: string | null
          payload: Json
          published: boolean
          rating_count: number
          segment: string | null
          slug: string
          tags: string[]
          updated_at: string
          version: string
        }
        Insert: {
          author?: string | null
          avg_rating?: number
          category?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          install_count?: number
          is_global?: boolean
          is_jcs_official?: boolean
          kind: string
          kpis?: Json
          name: string
          organization_id?: string | null
          payload?: Json
          published?: boolean
          rating_count?: number
          segment?: string | null
          slug: string
          tags?: string[]
          updated_at?: string
          version?: string
        }
        Update: {
          author?: string | null
          avg_rating?: number
          category?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          install_count?: number
          is_global?: boolean
          is_jcs_official?: boolean
          kind?: string
          kpis?: Json
          name?: string
          organization_id?: string | null
          payload?: Json
          published?: boolean
          rating_count?: number
          segment?: string | null
          slug?: string
          tags?: string[]
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          attendees: Json
          created_at: string
          end_at: string
          id: string
          lead_id: string
          meeting_url: string | null
          notes: string | null
          organization_id: string
          owner_id: string
          provider: string
          provider_event_id: string | null
          start_at: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          attendees?: Json
          created_at?: string
          end_at: string
          id?: string
          lead_id: string
          meeting_url?: string | null
          notes?: string | null
          organization_id: string
          owner_id: string
          provider: string
          provider_event_id?: string | null
          start_at: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          attendees?: Json
          created_at?: string
          end_at?: string
          id?: string
          lead_id?: string
          meeting_url?: string | null
          notes?: string | null
          organization_id?: string
          owner_id?: string
          provider?: string
          provider_event_id?: string | null
          start_at?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings_v2: {
        Row: {
          attendees: Json
          cancelled_at: string | null
          completed_at: string | null
          confirmation_status: string | null
          confirmed_at: string | null
          created_at: string
          created_via: string
          description: string | null
          end_at: string
          external_event_id: string | null
          happened: boolean | null
          id: string
          last_synced_at: string | null
          lead_id: string | null
          meeting_url: string | null
          no_show_message_sent_at: string | null
          organization_id: string
          outcome_notes: string | null
          outcome_overdue_alerted_at: string | null
          outcome_recorded_at: string | null
          outcome_recorded_by: string | null
          owner_user_id: string
          provider: string
          reminder_24h_sent_at: string | null
          reminder_2h_sent_at: string | null
          reminder_same_day_sent_at: string | null
          start_at: string
          status: string
          timezone: string
          title: string | null
          updated_at: string
        }
        Insert: {
          attendees?: Json
          cancelled_at?: string | null
          completed_at?: string | null
          confirmation_status?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_via?: string
          description?: string | null
          end_at: string
          external_event_id?: string | null
          happened?: boolean | null
          id?: string
          last_synced_at?: string | null
          lead_id?: string | null
          meeting_url?: string | null
          no_show_message_sent_at?: string | null
          organization_id: string
          outcome_notes?: string | null
          outcome_overdue_alerted_at?: string | null
          outcome_recorded_at?: string | null
          outcome_recorded_by?: string | null
          owner_user_id: string
          provider: string
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          reminder_same_day_sent_at?: string | null
          start_at: string
          status?: string
          timezone?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          attendees?: Json
          cancelled_at?: string | null
          completed_at?: string | null
          confirmation_status?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_via?: string
          description?: string | null
          end_at?: string
          external_event_id?: string | null
          happened?: boolean | null
          id?: string
          last_synced_at?: string | null
          lead_id?: string | null
          meeting_url?: string | null
          no_show_message_sent_at?: string | null
          organization_id?: string
          outcome_notes?: string | null
          outcome_overdue_alerted_at?: string | null
          outcome_recorded_at?: string | null
          outcome_recorded_by?: string | null
          owner_user_id?: string
          provider?: string
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          reminder_same_day_sent_at?: string | null
          start_at?: string
          status?: string
          timezone?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_v2_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          cadence_day: number | null
          channel: Database["public"]["Enums"]["msg_channel"]
          conversation_origin: string
          created_at: string
          direction: Database["public"]["Enums"]["msg_direction"]
          error_detail: string | null
          external_id: string | null
          generated_by_ai: boolean
          id: string
          intent: Database["public"]["Enums"]["lead_intent"] | null
          lead_id: string
          llm_model: string | null
          organization_id: string | null
          raw_response: Json | null
          read_at: string | null
          status: Database["public"]["Enums"]["msg_status"]
          subject: string | null
          variant_key: string | null
        }
        Insert: {
          body?: string | null
          cadence_day?: number | null
          channel: Database["public"]["Enums"]["msg_channel"]
          conversation_origin?: string
          created_at?: string
          direction: Database["public"]["Enums"]["msg_direction"]
          error_detail?: string | null
          external_id?: string | null
          generated_by_ai?: boolean
          id?: string
          intent?: Database["public"]["Enums"]["lead_intent"] | null
          lead_id: string
          llm_model?: string | null
          organization_id?: string | null
          raw_response?: Json | null
          read_at?: string | null
          status?: Database["public"]["Enums"]["msg_status"]
          subject?: string | null
          variant_key?: string | null
        }
        Update: {
          body?: string | null
          cadence_day?: number | null
          channel?: Database["public"]["Enums"]["msg_channel"]
          conversation_origin?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["msg_direction"]
          error_detail?: string | null
          external_id?: string | null
          generated_by_ai?: boolean
          id?: string
          intent?: Database["public"]["Enums"]["lead_intent"] | null
          lead_id?: string
          llm_model?: string | null
          organization_id?: string | null
          raw_response?: Json | null
          read_at?: string | null
          status?: Database["public"]["Enums"]["msg_status"]
          subject?: string | null
          variant_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      orbit_sync_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          lead_id: string | null
          organization_id: string
          request_payload: Json | null
          response_payload: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          lead_id?: string | null
          organization_id: string
          request_payload?: Json | null
          response_payload?: Json | null
          status: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          lead_id?: string | null
          organization_id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "orbit_sync_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          id: string
          organization_id: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          organization_id?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          organization_id?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_plans: {
        Row: {
          advanced_analytics_enabled: boolean
          apify_enabled: boolean
          code: string
          created_at: string
          description: string | null
          limite_agentes: number
          limite_importacoes: number
          limite_leads: number
          limite_ligacoes: number
          limite_mensagens: number
          limite_usuarios: number
          max_calls_month: number
          monthly_price_cents: number
          name: string
          orbit_enabled: boolean
          price_yearly_cents: number
          status: string
          updated_at: string
          voice_ai_enabled: boolean
          white_label_enabled: boolean
        }
        Insert: {
          advanced_analytics_enabled?: boolean
          apify_enabled?: boolean
          code: string
          created_at?: string
          description?: string | null
          limite_agentes?: number
          limite_importacoes?: number
          limite_leads?: number
          limite_ligacoes?: number
          limite_mensagens?: number
          limite_usuarios?: number
          max_calls_month?: number
          monthly_price_cents?: number
          name: string
          orbit_enabled?: boolean
          price_yearly_cents?: number
          status?: string
          updated_at?: string
          voice_ai_enabled?: boolean
          white_label_enabled?: boolean
        }
        Update: {
          advanced_analytics_enabled?: boolean
          apify_enabled?: boolean
          code?: string
          created_at?: string
          description?: string | null
          limite_agentes?: number
          limite_importacoes?: number
          limite_leads?: number
          limite_ligacoes?: number
          limite_mensagens?: number
          limite_usuarios?: number
          max_calls_month?: number
          monthly_price_cents?: number
          name?: string
          orbit_enabled?: boolean
          price_yearly_cents?: number
          status?: string
          updated_at?: string
          voice_ai_enabled?: boolean
          white_label_enabled?: boolean
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          custom_domain: string | null
          email_signature: string | null
          favicon_url: string | null
          footer_text: string | null
          id: string
          logo_url: string | null
          name: string
          plan: string
          primary_color: string | null
          secondary_color: string | null
          slug: string
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_domain?: string | null
          email_signature?: string | null
          favicon_url?: string | null
          footer_text?: string | null
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_domain?: string | null
          email_signature?: string | null
          favicon_url?: string | null
          footer_text?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          billing_history_id: string | null
          created_at: string
          currency: string
          external_id: string | null
          id: string
          organization_id: string
          paid_at: string | null
          provider: string | null
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          billing_history_id?: string | null
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          organization_id: string
          paid_at?: string | null
          provider?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          billing_history_id?: string | null
          created_at?: string
          currency?: string
          external_id?: string | null
          id?: string
          organization_id?: string
          paid_at?: string | null
          provider?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_billing_history_id_fkey"
            columns: ["billing_history_id"]
            isOneToOne: false
            referencedRelation: "billing_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_catalog: {
        Row: {
          cor: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          icone: string | null
          icp_id: string | null
          id: string
          nome: string
          ordem: number
          organization_id: string
          produto_padrao: boolean
          status: string
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          icone?: string | null
          icp_id?: string | null
          id?: string
          nome: string
          ordem?: number
          organization_id: string
          produto_padrao?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          icone?: string | null
          icp_id?: string | null
          id?: string
          nome?: string
          ordem?: number
          organization_id?: string
          produto_padrao?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_catalog_icp_id_fkey"
            columns: ["icp_id"]
            isOneToOne: false
            referencedRelation: "ideal_customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          meeting_preferences: Json | null
          name: string | null
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          meeting_preferences?: Json | null
          name?: string | null
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          meeting_preferences?: Json | null
          name?: string | null
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_company_scores: {
        Row: {
          calculated_at: string
          classification: string
          created_at: string
          disqualifying_reasons: Json
          icp_id: string
          icp_score: number
          id: string
          matched_criteria: Json
          missing_criteria: Json
          organization_id: string
          prospecting_result_id: string
          qualified_for_import: boolean
          updated_at: string
        }
        Insert: {
          calculated_at?: string
          classification?: string
          created_at?: string
          disqualifying_reasons?: Json
          icp_id: string
          icp_score?: number
          id?: string
          matched_criteria?: Json
          missing_criteria?: Json
          organization_id: string
          prospecting_result_id: string
          qualified_for_import?: boolean
          updated_at?: string
        }
        Update: {
          calculated_at?: string
          classification?: string
          created_at?: string
          disqualifying_reasons?: Json
          icp_id?: string
          icp_score?: number
          id?: string
          matched_criteria?: Json
          missing_criteria?: Json
          organization_id?: string
          prospecting_result_id?: string
          qualified_for_import?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_company_scores_icp_id_fkey"
            columns: ["icp_id"]
            isOneToOne: false
            referencedRelation: "ideal_customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_company_scores_prospecting_result_id_fkey"
            columns: ["prospecting_result_id"]
            isOneToOne: false
            referencedRelation: "prospecting_results"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_decision_makers: {
        Row: {
          confidence: number | null
          created_at: string
          email: string | null
          id: string
          level: string | null
          linkedin: string | null
          name: string
          organization_id: string | null
          phone: string | null
          result_id: string | null
          role: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          email?: string | null
          id?: string
          level?: string | null
          linkedin?: string | null
          name: string
          organization_id?: string | null
          phone?: string | null
          result_id?: string | null
          role?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          email?: string | null
          id?: string
          level?: string | null
          linkedin?: string | null
          name?: string
          organization_id?: string | null
          phone?: string | null
          result_id?: string | null
          role?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_decision_makers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_decision_makers_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "prospecting_results"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_results: {
        Row: {
          address: string | null
          bio: string | null
          capital_social: number | null
          category: string | null
          city: string | null
          cnae: string | null
          cnaes_secundarios: Json
          cnpj: string | null
          company_name: string
          company_size: string | null
          contact_confidence: string | null
          created_at: string
          data_abertura: string | null
          data_quality_score: number | null
          decision_maker_status: string | null
          decision_makers_status: string | null
          discovery_source: string | null
          email: string | null
          enriched_at: string | null
          enrichment: Json | null
          enrichment_cost_cents: number
          enrichment_errors: Json
          enrichment_sources: Json
          enrichment_status: string
          estimated_employees: number | null
          estimated_revenue: string | null
          followers: number | null
          google_maps_url: string | null
          id: string
          instagram_url: string | null
          lead_id: string | null
          linkedin_url: string | null
          natureza_juridica: string | null
          organization_id: string | null
          phone: string | null
          porte: string | null
          possible_whatsapp: string | null
          pre_score_stage: string | null
          preliminary_score: number | null
          preliminary_status: string | null
          rating: number | null
          raw: Json | null
          reviews_count: number | null
          score: number | null
          score_label: string | null
          search_id: string | null
          segment: string | null
          situacao_cadastral: string | null
          smart_flow_metadata: Json
          smart_flow_status: string | null
          state: string | null
          status: string
          technologies: Json | null
          updated_at: string
          website: string | null
          whatsapp_confidence: string | null
        }
        Insert: {
          address?: string | null
          bio?: string | null
          capital_social?: number | null
          category?: string | null
          city?: string | null
          cnae?: string | null
          cnaes_secundarios?: Json
          cnpj?: string | null
          company_name: string
          company_size?: string | null
          contact_confidence?: string | null
          created_at?: string
          data_abertura?: string | null
          data_quality_score?: number | null
          decision_maker_status?: string | null
          decision_makers_status?: string | null
          discovery_source?: string | null
          email?: string | null
          enriched_at?: string | null
          enrichment?: Json | null
          enrichment_cost_cents?: number
          enrichment_errors?: Json
          enrichment_sources?: Json
          enrichment_status?: string
          estimated_employees?: number | null
          estimated_revenue?: string | null
          followers?: number | null
          google_maps_url?: string | null
          id?: string
          instagram_url?: string | null
          lead_id?: string | null
          linkedin_url?: string | null
          natureza_juridica?: string | null
          organization_id?: string | null
          phone?: string | null
          porte?: string | null
          possible_whatsapp?: string | null
          pre_score_stage?: string | null
          preliminary_score?: number | null
          preliminary_status?: string | null
          rating?: number | null
          raw?: Json | null
          reviews_count?: number | null
          score?: number | null
          score_label?: string | null
          search_id?: string | null
          segment?: string | null
          situacao_cadastral?: string | null
          smart_flow_metadata?: Json
          smart_flow_status?: string | null
          state?: string | null
          status?: string
          technologies?: Json | null
          updated_at?: string
          website?: string | null
          whatsapp_confidence?: string | null
        }
        Update: {
          address?: string | null
          bio?: string | null
          capital_social?: number | null
          category?: string | null
          city?: string | null
          cnae?: string | null
          cnaes_secundarios?: Json
          cnpj?: string | null
          company_name?: string
          company_size?: string | null
          contact_confidence?: string | null
          created_at?: string
          data_abertura?: string | null
          data_quality_score?: number | null
          decision_maker_status?: string | null
          decision_makers_status?: string | null
          discovery_source?: string | null
          email?: string | null
          enriched_at?: string | null
          enrichment?: Json | null
          enrichment_cost_cents?: number
          enrichment_errors?: Json
          enrichment_sources?: Json
          enrichment_status?: string
          estimated_employees?: number | null
          estimated_revenue?: string | null
          followers?: number | null
          google_maps_url?: string | null
          id?: string
          instagram_url?: string | null
          lead_id?: string | null
          linkedin_url?: string | null
          natureza_juridica?: string | null
          organization_id?: string | null
          phone?: string | null
          porte?: string | null
          possible_whatsapp?: string | null
          pre_score_stage?: string | null
          preliminary_score?: number | null
          preliminary_status?: string | null
          rating?: number | null
          raw?: Json | null
          reviews_count?: number | null
          score?: number | null
          score_label?: string | null
          search_id?: string | null
          segment?: string | null
          situacao_cadastral?: string | null
          smart_flow_metadata?: Json
          smart_flow_status?: string | null
          state?: string | null
          status?: string
          technologies?: Json | null
          updated_at?: string
          website?: string | null
          whatsapp_confidence?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_results_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_results_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_results_search_id_fkey"
            columns: ["search_id"]
            isOneToOne: false
            referencedRelation: "prospecting_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_searches: {
        Row: {
          apify_run_id: string | null
          avg_processing_ms: number
          created_at: string
          created_by: string | null
          credits_saved: number
          credits_spent: number
          error: string | null
          final_minimum_score: number | null
          icp_id: string | null
          id: string
          max_companies_to_analyze: number | null
          max_intelligence_credits: number | null
          organization_id: string | null
          params: Json
          preliminary_minimum_score: number | null
          product_id: string | null
          smart_flow_enabled: boolean
          smart_flow_finished_at: string | null
          smart_flow_started_at: string | null
          smart_flow_stats: Json
          smart_flow_status: string | null
          smart_flow_stop_reason: string | null
          source_slug: string
          status: string
          target_good_leads: number | null
          total_descartados_icp: number
          total_discarded: number
          total_enriched: number
          total_found: number
          total_frios: number
          total_imported: number
          total_potenciais: number
          total_pre_scored: number
          total_promissores: number
          total_qualified: number
          updated_at: string
        }
        Insert: {
          apify_run_id?: string | null
          avg_processing_ms?: number
          created_at?: string
          created_by?: string | null
          credits_saved?: number
          credits_spent?: number
          error?: string | null
          final_minimum_score?: number | null
          icp_id?: string | null
          id?: string
          max_companies_to_analyze?: number | null
          max_intelligence_credits?: number | null
          organization_id?: string | null
          params?: Json
          preliminary_minimum_score?: number | null
          product_id?: string | null
          smart_flow_enabled?: boolean
          smart_flow_finished_at?: string | null
          smart_flow_started_at?: string | null
          smart_flow_stats?: Json
          smart_flow_status?: string | null
          smart_flow_stop_reason?: string | null
          source_slug: string
          status?: string
          target_good_leads?: number | null
          total_descartados_icp?: number
          total_discarded?: number
          total_enriched?: number
          total_found?: number
          total_frios?: number
          total_imported?: number
          total_potenciais?: number
          total_pre_scored?: number
          total_promissores?: number
          total_qualified?: number
          updated_at?: string
        }
        Update: {
          apify_run_id?: string | null
          avg_processing_ms?: number
          created_at?: string
          created_by?: string | null
          credits_saved?: number
          credits_spent?: number
          error?: string | null
          final_minimum_score?: number | null
          icp_id?: string | null
          id?: string
          max_companies_to_analyze?: number | null
          max_intelligence_credits?: number | null
          organization_id?: string | null
          params?: Json
          preliminary_minimum_score?: number | null
          product_id?: string | null
          smart_flow_enabled?: boolean
          smart_flow_finished_at?: string | null
          smart_flow_started_at?: string | null
          smart_flow_stats?: Json
          smart_flow_status?: string | null
          smart_flow_stop_reason?: string | null
          source_slug?: string
          status?: string
          target_good_leads?: number | null
          total_descartados_icp?: number
          total_discarded?: number
          total_enriched?: number
          total_found?: number
          total_frios?: number
          total_imported?: number
          total_potenciais?: number
          total_pre_scored?: number
          total_promissores?: number
          total_qualified?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_searches_icp_id_fkey"
            columns: ["icp_id"]
            isOneToOne: false
            referencedRelation: "ideal_customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_searches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_searches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_sources: {
        Row: {
          active: boolean
          config_schema: Json
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          config_schema?: Json
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          config_schema?: Json
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          provider: string
          result: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          provider: string
          result?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          provider?: string
          result?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_budget_limits: {
        Row: {
          created_at: string
          daily_budget: number | null
          daily_limit: number | null
          enabled: boolean
          id: string
          monthly_budget: number | null
          monthly_limit: number | null
          organization_id: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_budget?: number | null
          daily_limit?: number | null
          enabled?: boolean
          id?: string
          monthly_budget?: number | null
          monthly_limit?: number | null
          organization_id?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_budget?: number | null
          daily_limit?: number | null
          enabled?: boolean
          id?: string
          monthly_budget?: number | null
          monthly_limit?: number | null
          organization_id?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_budget_limits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_capabilities: {
        Row: {
          available: boolean
          capability: string
          created_at: string
          credits_cost: number
          currency: string
          enabled: boolean
          estimated_cost: number
          id: string
          metadata: Json
          provider: string
          requires_adapter: boolean
          updated_at: string
        }
        Insert: {
          available?: boolean
          capability: string
          created_at?: string
          credits_cost?: number
          currency?: string
          enabled?: boolean
          estimated_cost?: number
          id?: string
          metadata?: Json
          provider: string
          requires_adapter?: boolean
          updated_at?: string
        }
        Update: {
          available?: boolean
          capability?: string
          created_at?: string
          credits_cost?: number
          currency?: string
          enabled?: boolean
          estimated_cost?: number
          id?: string
          metadata?: Json
          provider?: string
          requires_adapter?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      provider_credentials: {
        Row: {
          base_url: string | null
          created_at: string
          created_by: string | null
          credential_mode: string
          daily_limit: number | null
          enabled: boolean
          encrypted_secret_reference: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_success_at: string | null
          last_test_at: string | null
          last4: string | null
          max_concurrent_requests: number | null
          metadata: Json
          monthly_limit: number | null
          organization_id: string | null
          priority: number
          provider: string
          requests_per_hour: number | null
          requests_per_minute: number | null
          status: string
          timeout_ms: number | null
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          credential_mode?: string
          daily_limit?: number | null
          enabled?: boolean
          encrypted_secret_reference?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_test_at?: string | null
          last4?: string | null
          max_concurrent_requests?: number | null
          metadata?: Json
          monthly_limit?: number | null
          organization_id?: string | null
          priority?: number
          provider: string
          requests_per_hour?: number | null
          requests_per_minute?: number | null
          status?: string
          timeout_ms?: number | null
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          credential_mode?: string
          daily_limit?: number | null
          enabled?: boolean
          encrypted_secret_reference?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          last_test_at?: string | null
          last4?: string | null
          max_concurrent_requests?: number | null
          metadata?: Json
          monthly_limit?: number | null
          organization_id?: string | null
          priority?: number
          provider?: string
          requests_per_hour?: number | null
          requests_per_minute?: number | null
          status?: string
          timeout_ms?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_secret_vault: {
        Row: {
          auth_tag: string
          ciphertext: string
          created_at: string
          iv: string
          organization_id: string | null
          provider: string
          reference: string
          updated_at: string
        }
        Insert: {
          auth_tag: string
          ciphertext: string
          created_at?: string
          iv: string
          organization_id?: string | null
          provider: string
          reference: string
          updated_at?: string
        }
        Update: {
          auth_tag?: string
          ciphertext?: string
          created_at?: string
          iv?: string
          organization_id?: string | null
          provider?: string
          reference?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_secret_vault_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_usage_events: {
        Row: {
          created_at: string
          estimated_cost: number | null
          estimated_cost_avoided: number | null
          id: string
          metadata: Json | null
          operation: string
          organization_id: string
          prospecting_result_id: string | null
          prospecting_search_id: string | null
          provider: string
          skipped_reason: string | null
          success: boolean
          units: number
        }
        Insert: {
          created_at?: string
          estimated_cost?: number | null
          estimated_cost_avoided?: number | null
          id?: string
          metadata?: Json | null
          operation: string
          organization_id: string
          prospecting_result_id?: string | null
          prospecting_search_id?: string | null
          provider: string
          skipped_reason?: string | null
          success?: boolean
          units?: number
        }
        Update: {
          created_at?: string
          estimated_cost?: number | null
          estimated_cost_avoided?: number | null
          id?: string
          metadata?: Json | null
          operation?: string
          organization_id?: string
          prospecting_result_id?: string | null
          prospecting_search_id?: string | null
          provider?: string
          skipped_reason?: string | null
          success?: boolean
          units?: number
        }
        Relationships: []
      }
      qualification_answers: {
        Row: {
          confidence: number | null
          created_at: string
          field: string
          id: string
          lead_id: string
          organization_id: string | null
          source: string
          value: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          field: string
          id?: string
          lead_id: string
          organization_id?: string | null
          source?: string
          value?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          field?: string
          id?: string
          lead_id?: string
          organization_id?: string | null
          source?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qualification_answers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualification_answers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_logs: {
        Row: {
          action: string
          created_at: string
          error: string | null
          http_status: number | null
          id: string
          lead_id: string | null
          organization_id: string
          payload: Json | null
          provider: string | null
          request_ms: number | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          lead_id?: string | null
          organization_id: string
          payload?: Json | null
          provider?: string | null
          request_ms?: number | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          error?: string | null
          http_status?: number | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          payload?: Json | null
          provider?: string | null
          request_ms?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          external_customer_id: string | null
          external_id: string | null
          external_payment_provider: string | null
          external_subscription_id: string | null
          id: string
          organization_id: string
          plan_code: string
          provider: string | null
          status: string
          trial_ends_at: string | null
          trial_starts_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          external_customer_id?: string | null
          external_id?: string | null
          external_payment_provider?: string | null
          external_subscription_id?: string | null
          id?: string
          organization_id: string
          plan_code: string
          provider?: string | null
          status?: string
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          external_customer_id?: string | null
          external_id?: string | null
          external_payment_provider?: string | null
          external_subscription_id?: string | null
          id?: string
          organization_id?: string
          plan_code?: string
          provider?: string | null
          status?: string
          trial_ends_at?: string | null
          trial_starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "organization_plans"
            referencedColumns: ["code"]
          },
        ]
      }
      usage_counters: {
        Row: {
          agents_count: number
          apify_runs: number
          cadences_count: number
          calls_made: number
          created_at: string
          id: string
          leads_count: number
          messages_sent: number
          organization_id: string
          period_month: string
          updated_at: string
          users_count: number
        }
        Insert: {
          agents_count?: number
          apify_runs?: number
          cadences_count?: number
          calls_made?: number
          created_at?: string
          id?: string
          leads_count?: number
          messages_sent?: number
          organization_id: string
          period_month: string
          updated_at?: string
          users_count?: number
        }
        Update: {
          agents_count?: number
          apify_runs?: number
          cadences_count?: number
          calls_made?: number
          created_at?: string
          id?: string
          leads_count?: number
          messages_sent?: number
          organization_id?: string
          period_month?: string
          updated_at?: string
          users_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      [_ in never]: never
    }
    Functions: {
      bump_variant_reply: {
        Args: {
          _channel: string
          _day: number
          _key: string
          _positive: boolean
        }
        Returns: undefined
      }
      bump_variant_sent: {
        Args: { _channel: string; _day: number; _key: string }
        Returns: undefined
      }
      current_org_id: { Args: never; Returns: string }
      find_lead_by_phone: {
        Args: { _org_id: string; _tail: string }
        Returns: {
          agent_id: string
          ai_paused: boolean
          cidade: string
          estado: string
          id: string
          nome_fantasia: string
          notes: string
          opt_out: boolean
          razao_social: string
          segmento: string
          status: string
          telefone: string
          whatsapp: string
        }[]
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
      is_manager: { Args: { _user_id: string }; Returns: boolean }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      list_org_calendar_status: {
        Args: never
        Returns: {
          connected: boolean
          email: string
          expires_at: string
          external_email: string
          name: string
          provider: string
          updated_at: string
          user_id: string
        }[]
      }
      list_org_email_status: {
        Args: never
        Returns: {
          connected: boolean
          email: string
          expires_at: string
          external_email: string
          name: string
          provider: string
          updated_at: string
          user_id: string
        }[]
      }
      match_knowledge_chunks: {
        Args: {
          _categories?: string[]
          _match_count?: number
          _org: string
          _query_embedding: string
          _threshold?: number
        }
        Returns: {
          chunk_id: string
          chunk_text: string
          similarity: number
          source_category: string
          source_id: string
          source_title: string
        }[]
      }
      seed_default_product_catalog: {
        Args: { _org: string }
        Returns: undefined
      }
      usage_increment: {
        Args: { _by?: number; _field: string; _org: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "gerente" | "sdr" | "comercial" | "superadmin"
      lead_intent:
        | "interessado"
        | "pediu_info"
        | "objecao"
        | "desinteresse"
        | "agendar"
      lead_status:
        | "coletado"
        | "enriquecido"
        | "em_cadencia"
        | "qualificado"
        | "reuniao"
        | "convertido"
        | "descartado"
        | "inbound_new"
        | "inbound_in_progress"
        | "inbound_qualified"
        | "support_requested"
        | "finance_requested"
        | "needs_human"
        | "human_assigned"
        | "inbound_closed"
      message_channel: "whatsapp" | "email" | "voice"
      message_direction: "outbound" | "inbound"
      message_status: "pending" | "sent" | "failed" | "delivered" | "received"
      msg_channel: "whatsapp" | "email" | "voice"
      msg_direction: "outbound" | "inbound"
      msg_status: "pending" | "sent" | "failed" | "delivered" | "received"
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
      app_role: ["admin", "gerente", "sdr", "comercial", "superadmin"],
      lead_intent: [
        "interessado",
        "pediu_info",
        "objecao",
        "desinteresse",
        "agendar",
      ],
      lead_status: [
        "coletado",
        "enriquecido",
        "em_cadencia",
        "qualificado",
        "reuniao",
        "convertido",
        "descartado",
        "inbound_new",
        "inbound_in_progress",
        "inbound_qualified",
        "support_requested",
        "finance_requested",
        "needs_human",
        "human_assigned",
        "inbound_closed",
      ],
      message_channel: ["whatsapp", "email", "voice"],
      message_direction: ["outbound", "inbound"],
      message_status: ["pending", "sent", "failed", "delivered", "received"],
      msg_channel: ["whatsapp", "email", "voice"],
      msg_direction: ["outbound", "inbound"],
      msg_status: ["pending", "sent", "failed", "delivered", "received"],
    },
  },
} as const
