/**
 * Google Calendar API Executor
 * 
 * Handles all Google Calendar API v3 operations using the googleapis npm package.
 * Supports multiple resources: Calendar, Event, Calendar List, ACL, Settings, Colors, Free/Busy, Watch
 */

import { google, calendar_v3 } from 'googleapis';
import { SupabaseClient } from '@supabase/supabase-js';
import { getGoogleAccessToken } from './google-sheets';

export interface GoogleCalendarOperationParams {
  resource: string;
  operation: string;
  calendarId?: string;
  eventId?: string;
  summary?: string;
  description?: string;
  location?: string;
  timeZone?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  eventData?: {
    summary?: string;
    description?: string;
    location?: string;
    attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
    reminders?: { useDefault?: boolean; overrides?: Array<{ method: string; minutes: number }> };
    recurrence?: string[];
    colorId?: string;
    transparency?: string;
    visibility?: string;
    timeZone?: string;
  };
  text?: string;
  sendUpdates?: string;
  destinationCalendarId?: string;
  icalUID?: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  pageToken?: string;
  q?: string;
  singleEvents?: boolean;
  orderBy?: string;
  showDeleted?: boolean;
  showHidden?: boolean;
  updatedMin?: string;
  alwaysIncludeEmail?: boolean;
  maxAttendees?: number;
  colorRgbFormat?: string;
  selected?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  hidden?: boolean;
  notificationSettings?: any[];
  ruleId?: string;
  role?: string;
  scope?: { type: string; value: string };
  setting?: string;
  items?: Array<{ id: string }>;
  groupExpansionMax?: number;
  calendarExpansionMax?: number;
  channelId?: string;
  resourceId?: string;
  returnAll?: boolean;
}

/**
 * Initialize Google Calendar API client with OAuth token
 */
function getCalendarClient(accessToken: string): calendar_v3.Calendar {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth });
}

/**
 * Execute Google Calendar operation
 */
export async function executeGoogleCalendarOperation(
  supabase: SupabaseClient,
  userIds: string[],
  params: GoogleCalendarOperationParams
): Promise<any> {
  // Get access token
  const accessToken = await getGoogleAccessToken(supabase, userIds);
  if (!accessToken) {
    throw new Error('Google Calendar: OAuth token not found. Please connect your Google account in the Connections panel.');
  }

  const calendar = getCalendarClient(accessToken);
  const { resource, operation } = params;

  try {
    // ==================== CALENDAR OPERATIONS ====================
    if (resource === 'calendar') {
      if (operation === 'get') {
        if (!params.calendarId) throw new Error('calendarId is required');
        const response = await calendar.calendars.get({ calendarId: params.calendarId });
        return response.data;
      } else if (operation === 'list') {
        const response = await calendar.calendarList.list({
          maxResults: params.maxResults,
          pageToken: params.pageToken,
          showDeleted: params.showDeleted,
          showHidden: params.showHidden,
        });
        return params.returnAll ? await getAllPages(calendar.calendarList.list.bind(calendar.calendarList) as any, response) : response.data;
      } else if (operation === 'create') {
        if (!params.summary) throw new Error('summary is required');
        const response = await calendar.calendars.insert({
          requestBody: {
            summary: params.summary,
            description: params.description,
            location: params.location,
            timeZone: params.timeZone,
          },
        });
        return response.data;
      } else if (operation === 'update') {
        if (!params.calendarId || !params.summary) throw new Error('calendarId and summary are required');
        const response = await calendar.calendars.update({
          calendarId: params.calendarId,
          requestBody: {
            summary: params.summary,
            description: params.description,
            location: params.location,
            timeZone: params.timeZone,
          },
        });
        return response.data;
      } else if (operation === 'delete') {
        if (!params.calendarId) throw new Error('calendarId is required');
        await calendar.calendars.delete({ calendarId: params.calendarId });
        return { success: true };
      } else if (operation === 'clear') {
        if (!params.calendarId) throw new Error('calendarId is required');
        await calendar.calendars.clear({ calendarId: params.calendarId });
        return { success: true };
      }
    }
    // ==================== CALENDAR LIST OPERATIONS ====================
    else if (resource === 'calendarList') {
      if (operation === 'get') {
        if (!params.calendarId) throw new Error('calendarId is required');
        const response = await calendar.calendarList.get({ calendarId: params.calendarId });
        return response.data;
      } else if (operation === 'list') {
        const response = await calendar.calendarList.list({
          maxResults: params.maxResults,
          pageToken: params.pageToken,
          showDeleted: params.showDeleted,
          showHidden: params.showHidden,
        });
        return params.returnAll ? await getAllPages(calendar.calendarList.list.bind(calendar.calendarList) as any, response) : response.data;
      } else if (operation === 'update') {
        if (!params.calendarId) throw new Error('calendarId is required');
        const response = await calendar.calendarList.update({
          calendarId: params.calendarId,
          requestBody: {
            // Calendar list update fields - only include if provided
            ...(params.colorRgbFormat && { colorRgbFormat: params.colorRgbFormat }),
            ...(params.selected !== undefined && { selected: params.selected }),
            ...(params.backgroundColor && { backgroundColor: params.backgroundColor }),
            ...(params.foregroundColor && { foregroundColor: params.foregroundColor }),
            ...(params.hidden !== undefined && { hidden: params.hidden }),
            ...(params.notificationSettings && { notificationSettings: params.notificationSettings }),
          } as any,
        });
        return response.data;
      } else if (operation === 'delete') {
        if (!params.calendarId) throw new Error('calendarId is required');
        await calendar.calendarList.delete({ calendarId: params.calendarId });
        return { success: true };
      }
    }
    // ==================== EVENT OPERATIONS ====================
    else if (resource === 'event') {
      if (operation === 'get') {
        if (!params.calendarId || !params.eventId) throw new Error('calendarId and eventId are required');
        const response = await calendar.events.get({
          calendarId: params.calendarId,
          eventId: params.eventId,
          timeZone: params.timeZone,
        });
        return response.data;
      } else if (operation === 'list') {
        if (!params.calendarId) throw new Error('calendarId is required');
        const response = await calendar.events.list({
          calendarId: params.calendarId,
          timeMin: params.timeMin,
          timeMax: params.timeMax,
          maxResults: params.maxResults,
          pageToken: params.pageToken,
          q: params.q,
          singleEvents: params.singleEvents,
          orderBy: params.orderBy as any,
          showDeleted: params.showDeleted,
          updatedMin: params.updatedMin,
        });
        return params.returnAll ? await getAllPages(calendar.events.list.bind(calendar.events) as any, response) : response.data;
      } else if (operation === 'create') {
        if (!params.calendarId || !params.start || !params.end) {
          throw new Error('calendarId, start, and end are required');
        }
        // Merge eventData with explicit fields
        const eventData = params.eventData || {};
        const response = await calendar.events.insert({
          calendarId: params.calendarId,
          sendUpdates: params.sendUpdates as any,
          requestBody: {
            summary: params.summary || eventData.summary,
            description: eventData.description,
            location: eventData.location,
            start: params.start,
            end: params.end,
            attendees: eventData.attendees,
            reminders: eventData.reminders,
            recurrence: eventData.recurrence,
            colorId: eventData.colorId,
            transparency: eventData.transparency,
            visibility: eventData.visibility,
            timeZone: eventData.timeZone,
          } as any,
        });
        return response.data;
      } else if (operation === 'quickAdd') {
        if (!params.calendarId || !params.text) throw new Error('calendarId and text are required');
        const response = await calendar.events.quickAdd({
          calendarId: params.calendarId,
          text: params.text,
          sendUpdates: params.sendUpdates as any,
        });
        return response.data;
      } else if (operation === 'update') {
        if (!params.calendarId || !params.eventId) throw new Error('calendarId and eventId are required');
        // Merge eventData with explicit fields
        const eventData = params.eventData || {};
        const requestBody: any = {};
        if (params.summary || eventData.summary) requestBody.summary = params.summary || eventData.summary;
        if (eventData.description !== undefined) requestBody.description = eventData.description;
        if (eventData.location !== undefined) requestBody.location = eventData.location;
        if (params.start) requestBody.start = params.start;
        if (params.end) requestBody.end = params.end;
        if (eventData.attendees) requestBody.attendees = eventData.attendees;
        if (eventData.reminders) requestBody.reminders = eventData.reminders;
        if (eventData.recurrence) requestBody.recurrence = eventData.recurrence;
        if (eventData.colorId) requestBody.colorId = eventData.colorId;
        if (eventData.transparency) requestBody.transparency = eventData.transparency;
        if (eventData.visibility) requestBody.visibility = eventData.visibility;
        if (eventData.timeZone) requestBody.timeZone = eventData.timeZone;
        
        const response = await calendar.events.update({
          calendarId: params.calendarId,
          eventId: params.eventId,
          sendUpdates: params.sendUpdates as any,
          requestBody,
        });
        return response.data;
      } else if (operation === 'delete') {
        if (!params.calendarId || !params.eventId) throw new Error('calendarId and eventId are required');
        await calendar.events.delete({
          calendarId: params.calendarId,
          eventId: params.eventId,
          sendUpdates: params.sendUpdates as any,
        });
        return { success: true };
      } else if (operation === 'move') {
        if (!params.calendarId || !params.eventId || !params.destinationCalendarId) {
          throw new Error('calendarId, eventId, and destinationCalendarId are required');
        }
        const response = await calendar.events.move({
          calendarId: params.calendarId,
          eventId: params.eventId,
          destination: params.destinationCalendarId,
        });
        return response.data;
      } else if (operation === 'import') {
        if (!params.calendarId || !params.icalUID) throw new Error('calendarId and icalUID are required');
        // Import requires a full event object - this is a simplified version
        // In practice, you'd need to provide the full iCal event data
        throw new Error('Import operation requires full iCal event data - not fully implemented');
      }
    }
    // ==================== EVENT INSTANCE OPERATIONS ====================
    else if (resource === 'eventInstance') {
      if (operation === 'list') {
        if (!params.calendarId || !params.eventId) throw new Error('calendarId and eventId are required');
        const response = await calendar.events.instances({
          calendarId: params.calendarId,
          eventId: params.eventId,
          maxResults: params.maxResults,
          pageToken: params.pageToken,
          timeMin: params.timeMin,
          timeMax: params.timeMax,
          showDeleted: params.showDeleted,
        });
        return params.returnAll ? await getAllPages(calendar.events.instances.bind(calendar.events) as any, response) : response.data;
      }
    }
    // ==================== ACL OPERATIONS ====================
    else if (resource === 'acl') {
      if (operation === 'get') {
        if (!params.calendarId || !params.ruleId) throw new Error('calendarId and ruleId are required');
        const response = await calendar.acl.get({
          calendarId: params.calendarId,
          ruleId: params.ruleId,
        });
        return response.data;
      } else if (operation === 'list') {
        if (!params.calendarId) throw new Error('calendarId is required');
        const response = await calendar.acl.list({
          calendarId: params.calendarId,
          maxResults: params.maxResults,
          pageToken: params.pageToken,
          showDeleted: params.showDeleted,
        });
        return params.returnAll ? await getAllPages(calendar.acl.list.bind(calendar.acl) as any, response) : response.data;
      } else if (operation === 'create') {
        if (!params.calendarId || !params.role || !params.scope) {
          throw new Error('calendarId, role, and scope are required');
        }
        const response = await calendar.acl.insert({
          calendarId: params.calendarId,
          requestBody: {
            role: params.role,
            scope: params.scope,
          },
        });
        return response.data;
      } else if (operation === 'update') {
        if (!params.calendarId || !params.ruleId || !params.role) {
          throw new Error('calendarId, ruleId, and role are required');
        }
        const response = await calendar.acl.update({
          calendarId: params.calendarId,
          ruleId: params.ruleId,
          requestBody: {
            role: params.role,
          },
        });
        return response.data;
      } else if (operation === 'delete') {
        if (!params.calendarId || !params.ruleId) throw new Error('calendarId and ruleId are required');
        await calendar.acl.delete({
          calendarId: params.calendarId,
          ruleId: params.ruleId,
        });
        return { success: true };
      }
    }
    // ==================== SETTINGS OPERATIONS ====================
    else if (resource === 'settings') {
      if (operation === 'get') {
        if (!params.setting) throw new Error('setting is required');
        const response = await calendar.settings.get({ setting: params.setting });
        return response.data;
      } else if (operation === 'list') {
        const response = await calendar.settings.list({
          maxResults: params.maxResults,
          pageToken: params.pageToken,
        });
        return params.returnAll ? await getAllPages(calendar.settings.list.bind(calendar.settings) as any, response) : response.data;
      }
    }
    // ==================== COLORS OPERATIONS ====================
    else if (resource === 'colors') {
      if (operation === 'get') {
        const response = await calendar.colors.get();
        return response.data;
      }
    }
    // ==================== FREE/BUSY OPERATIONS ====================
    else if (resource === 'freebusy') {
      if (operation === 'query') {
        if (!params.timeMin || !params.timeMax) throw new Error('timeMin and timeMax are required');
        const response = await calendar.freebusy.query({
          requestBody: {
            timeMin: params.timeMin,
            timeMax: params.timeMax,
            items: params.items,
            timeZone: params.timeZone,
          },
        });
        return response.data;
      }
    }
    // ==================== WATCH OPERATIONS ====================
    else if (resource === 'watch') {
      if (operation === 'watch') {
        if (!params.calendarId) throw new Error('calendarId is required');
        // Watch requires a channel configuration - simplified version
        const response = await calendar.events.watch({
          calendarId: params.calendarId,
          requestBody: {
            id: params.channelId || `channel-${Date.now()}`,
            type: 'web_hook',
            address: '', // This should be your webhook URL
          } as any,
        });
        return response.data;
      } else if (operation === 'stop') {
        if (!params.channelId || !params.resourceId) {
          throw new Error('channelId and resourceId are required');
        }
        // Stop watch is done via channels.stop API
        const response = await calendar.channels.stop({
          requestBody: {
            id: params.channelId,
            resourceId: params.resourceId,
          },
        });
        return { success: true };
      }
    }

    throw new Error(`Unknown resource "${resource}" or operation "${operation}"`);
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Google Calendar operation failed';
    const statusCode = error?.response?.status || error?.code || 'unknown';
    throw new Error(`Google Calendar ${resource}.${operation}: ${errorMessage} (status: ${statusCode})`);
  }
}

/**
 * Helper function to fetch all pages when returnAll is true
 */
async function getAllPages<T extends { data?: { nextPageToken?: string; items?: any[] } }>(
  listFn: (params?: any) => Promise<T>,
  firstResponse: T | any
): Promise<any> {
  const allItems: any[] = [];
  let currentResponse = firstResponse;
  let pageToken: string | undefined = undefined;

  do {
    if (currentResponse.data?.items) {
      allItems.push(...currentResponse.data.items);
    } else if (currentResponse.data && !Array.isArray(currentResponse.data)) {
      // Some APIs return data directly (not in items array)
      allItems.push(currentResponse.data);
    }

    pageToken = currentResponse.data?.nextPageToken;
    if (pageToken) {
      // Wrap the call to handle googleapis method signatures
      currentResponse = await (listFn as any)({ pageToken } as any);
    }
  } while (pageToken);

  // Return in the same format as the API response
  return {
    ...firstResponse.data,
    items: allItems,
    nextPageToken: undefined,
  };
}
