# Float - Vacation Group Calendar App

## Overview
Float is a collaborative vacation calendar application designed to streamline group trip planning. It enables members to create and propose activities, manage shared and personalized schedules of confirmed events, and coordinate travel logistics. The app aims to enhance the group travel experience by providing comprehensive planning tools that blend calendar and event management functionalities.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter
- **UI Framework**: shadcn/ui on Radix UI
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query
- **Form Handling**: React Hook Form with Zod

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js (REST API endpoints)
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Authentication**: Replit Auth with OpenID Connect
- **Session Management**: Express sessions with PostgreSQL store
- **Real-time**: WebSocket server
- **Validation**: Zod schemas

### Database Design
- **Primary Database**: PostgreSQL via Neon serverless
- **Key Tables**: `users`, `trip_calendars`, `trip_members`, `activities`, `activity_acceptances`, `activity_comments`, `sessions`.

### Key Features
- **Authentication**: Replit Auth, user management, route protection.
- **Trip Management**: Creation, unique share codes, multi-organizer support, dynamic membership, comprehensive data cleanup on deletion, and date change impact warnings (alerts users when changing trip dates would affect scheduled events).
- **Activity System**: Proposal model with rich details (name, description, location, cost, capacity, categories), response tracking, comments, and real-time conflict detection.
- **Unified Calendar View**: Day-by-day trip itinerary (default view) that combines:
  - **Confirmed plans** sorted by time (flights, hotels, restaurants, activities)
  - **Pending RSVPs** with inline Accept/Decline buttons
  - **Group proposals** with inline voting
  - **"Needs Attention" badge** in trip header showing count of pending items
  - Collapsible day cards with summary badges showing confirmed/pending/proposal counts
  - Alternative Month/Week/Day views still available via dropdown
- **Calendar Views**: Shared trip calendar and personalized schedules with focus filters.
- **UI/UX**: Modern high-tech theme with glassmorphism effects, gradient accents (cyan/violet/emerald/fuchsia), and animated backgrounds. Features include standardized `PageHeader`, `EmptyState`, `SaveProposeToggle`, `LiveCountdown`, and `StatusBadge` components. Mobile responsiveness and playful loading animations.
- **Theme System**: iOS-style light/dark mode toggle with:
  - ThemeProvider component wrapping the app (`client/src/components/theme-provider.tsx`)
  - ThemeToggle component in navigation headers (`client/src/components/theme-toggle.tsx`)
  - Default theme: dark mode (persists to localStorage)
  - System preference detection via matchMedia API
  - CSS classes: `.light` and `.dark` on document root
  - Themed utility classes: `dashboard-themed-*` and `trip-themed-*` with separate light/dark variants
- **Dark Theme Design System**:
  - Base: Dark slate (slate-900/slate-800) with subtle transparency
  - Accent gradients: Cyan (#06B6D4), Violet (#8B5CF6), Emerald (#10B981), Fuchsia (#D946EF)
  - Glassmorphism: `bg-slate-800/60 backdrop-blur-xl border-white/10`
  - Neon border effects for interactive elements
  - Gradient progress bars and badges
  - Page-shell with radial gradient overlays for ambient lighting effect
- **StatusBadge System**: Unified status badge component with consistent color scheme across all proposal types:
  - Emerald (green): confirmed, scheduled, booked, selected, completed, accepted, available
  - Blue: proposed, active, voting (active voting in progress)
  - Amber: voting-closed (deadline passed), top-choice, pending, needs-response
  - Rose (red): declined, canceled, cancelled, rejected
  - Sky (cyan): in-progress (happening now)
  - Slate (gray): waitlisted, unknown
  - Automatically applies voting-closed styling when proposal deadline has passed
- **Notifications**: Real-time notifications for trip events.
- **Expense Splitting**: Checkbox-based member selection, real-time calculation, and payment app integration.
- **Onboarding**: Interactive tutorial system.
- **Travel Management**: Comprehensive flight, hotel, and restaurant coordination with manual entry, edit/delete functionality, smart location auto-population, and search interfaces. All support dual-mode workflows:
  - **Schedule & Invite Mode**: Creates confirmed bookings and sends RSVP invites to selected members who can Accept/Decline
  - **Propose to Group Mode**: Creates proposals for group voting/ranking, not added to calendars until confirmed
- **RSVP System**: Tracks invitation responses for scheduled flights, hotels, and restaurants:
  - Database tables: `flight_rsvps`, `hotel_rsvps`, `restaurant_rsvps`
  - React components: `RsvpStatus`, `FlightRsvpSection`, `HotelRsvpSection`, `RestaurantRsvpSection`
  - Hook: `useRsvp` for managing RSVP state and mutations
  - Statuses: pending, accepted, declined
- **Packing List**: Collaborative and categorized packing list.

## External Dependencies
### Authentication
- Replit Auth
- connect-pg-simple
- passport

### Database
- @neondatabase/serverless
- drizzle-orm
- drizzle-kit

### UI Framework
- @radix-ui/
- shadcn/ui
- tailwindcss
- lucide-react

### Development Tools
- vite
- typescript
- eslint/prettier

### Location Data
- **Hardcoded Location Database**: Cities (56 entries) and Airports (64 entries) stored in PostgreSQL.
- **NO External APIs**: Location search uses only local database.

### Booking Links
- App provides redirect links to external booking sites rather than direct API integrations.