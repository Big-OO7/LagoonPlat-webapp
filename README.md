# Tabulatorum datorum notandorum - Data Labeling Platform

A Next.js application with Supabase authentication featuring role-based access control for Admin and Labeler users.

## Live Demo

**Production URL:** https://webapp-6ns6ar6he-om-9006s-projects.vercel.app

## Features

- Supabase Authentication (Email/Password)
- Role-Based Access Control (Admin & Labeler)
- Automatic user profile creation on signup
- Role-specific dashboards
- Protected routes with middleware
- Modern UI with Tailwind CSS

## Tech Stack

- **Frontend:** Next.js 15 with TypeScript
- **Styling:** Tailwind CSS
- **Authentication:** Supabase Auth
- **Database:** PostgreSQL (via Supabase)
- **Deployment:** Vercel
- **Version Control:** Git/GitHub

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Supabase account
- Vercel account (for deployment)

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/Big-OO7/Tabulatorum-datorum-notandorum-webapp.git
cd Tabulatorum-datorum-notandorum-webapp
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Database Schema

The application uses the following database structure:

### user_profiles table
- `id` (UUID) - References auth.users
- `role` (enum: 'admin' | 'labeler') - User role
- `email` (TEXT) - User email
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Row Level Security (RLS)
- Users can view their own profile
- Admins can view all profiles
- Only admins can create/delete profiles

## User Roles

### Admin
- Full access to the platform
- Can manage users and their roles
- Can create and assign labeling tasks
- Access to analytics and metrics

### Labeler
- Can view assigned tasks
- Can complete labeling work
- Limited to their own data

## Project Structure

```
src/
├── app/
│   ├── dashboard/      # Role-based dashboard
│   ├── login/          # Login page
│   ├── signup/         # Signup page
│   └── page.tsx        # Root redirect to login
├── components/
│   ├── AdminDashboard.tsx
│   └── LabelerDashboard.tsx
├── lib/
│   ├── supabase.ts          # Client-side Supabase client
│   └── supabase-server.ts   # Server-side Supabase client
└── middleware.ts            # Auth session management
```

## Deployment

The app is deployed on Vercel with automatic deployments from the main branch.

### Deploy Your Own

1. Fork this repository
2. Import to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

## Setting Up First Admin User

After signing up your first user:

1. Go to your Supabase project dashboard
2. Navigate to Table Editor > user_profiles
3. Find your user and update the `role` column from 'labeler' to 'admin'
4. Refresh the application

Alternatively, you can run this SQL in Supabase SQL Editor:
```sql
UPDATE user_profiles
SET role = 'admin'
WHERE email = 'your-email@example.com';
```

## Next Steps

Now that authentication is working, you can add:
- Task management functionality
- Data labeling interface
- File upload capabilities
- Analytics dashboard
- User management for admins
- Notification system

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT
