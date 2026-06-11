export interface SMSSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SMSProvider {
  sendSMS(to: string, message: string): Promise<SMSSendResult>;
}

export type SMSProviderType = 'twilio' | 'msg91' | 'fast2sms' | 'aws_sns' | 'mock';
