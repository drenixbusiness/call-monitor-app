export interface RCUser {
    id: number;
    name: string;
    extensionNumber: string;
    status: string;
    phoneNumbers: { phoneNumber: string; usageType: string }[];
    contact?: { department?: string };
}
  
export interface CallRecord {
    id: string;
    direction: 'Inbound' | 'Outbound';
    duration: number;
    startTime: string;
    result: string;
    from: { phoneNumber?: string; name?: string };
    to: { phoneNumber?: string; name?: string };
}
  
export interface UserCalls {
    [userId: string | number]: CallRecord[];
}
