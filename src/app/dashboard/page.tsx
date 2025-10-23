'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AdminDashboard from '@/components/AdminDashboard'
import LabelerDashboard from '@/components/LabelerDashboard'
import type { User } from '@supabase/supabase-js'

interface UserProfile {
  id: string
  role: 'admin' | 'labeler' | 'super_admin'
  email: string
  created_at: string
  updated_at: string
}

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadUserData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        setUser(user)

        // Get user profile with role
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (profileError && profileError.code === 'PGRST116') {
          // Profile doesn't exist, create it
          const { data: newProfile, error: createError } = await supabase
            .from('user_profiles')
            .insert({
              id: user.id,
              email: user.email,
              role: 'labeler',
            })
            .select()
            .single()

          if (createError) {
            setError('Failed to create profile: ' + createError.message)
          } else if (newProfile) {
            setProfile(newProfile)
          }
        } else if (profileError) {
          setError(profileError.message)
        } else if (profileData) {
          setProfile(profileData)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    loadUserData()
  }, [router, supabase])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Loading...</h1>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-8 bg-white rounded-lg shadow-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {error ? 'Profile Not Found' : 'Loading Profile...'}
          </h1>
          <p className="text-gray-600 mb-4">
            {error
              ? 'Your user profile is being created. This should only take a moment. Please refresh the page.'
              : 'Please wait while we load your profile...'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded"
          >
            Refresh Page
          </button>
          <p className="text-sm text-gray-500 mt-4">
            Email: {user.email}
          </p>
          {error && (
            <p className="text-xs text-red-600 mt-2">Error: {error}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {profile.role === 'admin' || profile.role === 'super_admin' ? (
        <AdminDashboard user={user} profile={profile} />
      ) : (
        <LabelerDashboard user={user} profile={profile} />
      )}
    </div>
  )
}
