# Enhanced Apple Calendar MCP Tool

## Overview

This document outlines the enhancements made to the Apple Calendar MCP tool to support calendar selection and color options for events. The enhanced tool provides better control over where events are created and how they appear.

## New Features

### 1. Calendar Selection

The enhanced tool now allows you to specify which calendar to create events in by name:

```javascript
{
  operation: "create",
  title: "Pool Server Shift - Sunset Marquis",
  startDate: "2025-05-23T09:30:00",
  endDate: "2025-05-23T17:30:00",
  location: "Sunset Marquis",
  notes: "SSM-F&B [520] - Pool Server Shift (8.00 h)",
  calendarName: "Work" // Specify target calendar
}
```

### 2. Event Color Options

While Apple Calendar primarily uses calendar-level colors, the tool now accepts event color parameters for future compatibility:

```javascript
{
  operation: "create",
  title: "Important Meeting",
  startDate: "2025-05-23T14:00:00",
  endDate: "2025-05-23T15:00:00",
  eventColor: "red" // Available colors: red, orange, yellow, green, blue, purple, brown, graphite
}
```

### 3. List Available Calendars

New operation to discover available calendars:

```javascript
{
  operation: "list-calendars"
}
```

Returns calendar information including:
- Name
- Color
- Type (Local, Exchange, CalDAV, etc.)
- Writable status
- Unique ID

## Tool Schema Updates

### Enhanced Calendar Tool Parameters

The calendar tool now supports these additional parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `calendarName` | string | Name of the calendar to create events in (optional) |
| `eventColor` | string | Color for the event (red, orange, yellow, green, blue, purple, brown, graphite) |
| `operation` | string | Now includes "list-calendars" option |

### Updated Operations

1. **search** - Search for events (unchanged)
2. **open** - Open specific event (unchanged)
3. **list** - List events in date range (unchanged)
4. **create** - Create event with enhanced options (updated)
5. **list-calendars** - List available calendars (new)

## Implementation Details

### New Types

```typescript
interface CalendarInfo {
  name: string;
  color: string;
  type: string;
  writable: boolean;
  id: string;
}

enum CalendarColors {
  Red = "red",
  Orange = "orange", 
  Yellow = "yellow",
  Green = "green",
  Blue = "blue",
  Purple = "purple",
  Brown = "brown",
  Graphite = "graphite"
}
```

### Enhanced Functions

1. **getAvailableCalendars()** - Returns list of all accessible calendars
2. **createEvent()** - Updated to accept calendarName and eventColor parameters

## Usage Examples

### Creating a Work Shift Event

```javascript
// Using the enhanced tool for your pool server shifts
{
  "operation": "create",
  "title": "Pool Server Shift - Sunset Marquis",
  "startDate": "2025-05-23T09:30:00",
  "endDate": "2025-05-23T17:30:00",
  "location": "Sunset Marquis",
  "notes": "SSM-F&B [520] - Pool Server Shift (8.00 h)",
  "calendarName": "Work",
  "eventColor": "blue"
}
```

### Listing Available Calendars

```javascript
{
  "operation": "list-calendars"
}
```

Expected response:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 3 available calendars:\n\nName: Calendar\nColor: blue\nType: Local\nWritable: Yes\nID: calendar-123\n\nName: Work\nColor: green\nType: Local\nWritable: Yes\nID: work-456\n\nName: Personal\nColor: red\nType: Local\nWritable: Yes\nID: personal-789"
    }
  ],
  "isError": false
}
```

## Testing

### Using MCP Inspector

1. Start the enhanced MCP server:
   ```bash
   cd /Users/Tommy/Documents/AI\ tools/MCP-Inspector
   ./start-inspector.sh bun /Users/Tommy/Documents/AI\ tools/apple-mcp-enhanced/index.ts
   ```

2. Navigate to http://localhost:6274

3. Test the calendar operations through the web interface

### Command Line Testing

Run the test script:
```bash
node /Users/Tommy/Documents/AI\ tools/apple-mcp-enhanced/test-calendar.js
```

## Installation & Setup

### For Claude Desktop

Update your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-mcp-enhanced": {
      "command": "bun",
      "args": ["/Users/Tommy/Documents/AI tools/apple-mcp-enhanced/index.ts"]
    }
  }
}
```

### Dependencies

The enhanced tool requires the same dependencies as the original:
- Bun runtime
- @jxa/run for AppleScript execution
- Calendar app access permissions

## Limitations & Notes

1. **Calendar Colors**: Apple Calendar primarily uses calendar-level colors rather than individual event colors. The `eventColor` parameter is included for future compatibility and may not affect the visual appearance in all Calendar versions.

2. **Calendar Names**: Calendar names must match exactly (case-sensitive). Use the `list-calendars` operation to see available options.

3. **Permissions**: The tool requires the same Calendar access permissions as the original implementation.

## Future Enhancements

Potential future improvements could include:
- Support for recurring events
- Event attendee management
- Calendar subscription management
- Advanced color handling based on Calendar version
- Integration with other calendar services (Exchange, Google Calendar)

## Troubleshooting

### Common Issues

1. **Calendar not found**: Use `list-calendars` to verify the exact calendar name
2. **Permission denied**: Check System Preferences > Privacy & Security > Automation
3. **Color not applied**: Remember that Apple Calendar uses calendar-level colors primarily

### Debug Mode

Set environment variable for enhanced logging:
```bash
DEBUG=true bun index.ts
```