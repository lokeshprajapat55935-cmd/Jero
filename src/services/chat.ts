import { getSupabaseClient } from '@/lib/supabase/resolveClient';

export type Conversation = {
  id: string;
  booking_id?: string;
  participant_ids: string[];
  last_message_at: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  status: 'sent' | 'delivered' | 'read';
  created_at: string;
};

export const chatService = {
  async getConversations(limit?: number, offset?: number) {
    const supabase = await getSupabaseClient();
    let query = supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false });

    if (limit !== undefined) {
      const start = offset || 0;
      const end = start + limit - 1;
      query = query.range(start, end);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data as Conversation[];
  },

  async getMessages(conversationId: string, limit?: number, offset?: number) {
    const supabase = await getSupabaseClient();
    let query = supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (limit !== undefined) {
      const start = offset || 0;
      const end = start + limit - 1;
      query = query.range(start, end);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data as Message[];
  },

  async sendMessage(conversationId: string, content: string) {
    const supabase = await getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content
      })
      .select()
      .single();
    
    if (error) throw error;
    return data as Message;
  }
};
