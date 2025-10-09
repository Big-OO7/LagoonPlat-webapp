import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AdminDashboard from '@/components/AdminDashboard'
import LabelerDashboard from '@/components/LabelerDashboard'

export default async function Dashboard() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile with role
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Loading profile...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {profile.role === 'admin' ? (
        <AdminDashboard user={user} profile={profile} />
      ) : (
        <LabelerDashboard user={user} profile={profile} />
      )}
    </div>
  )
}
