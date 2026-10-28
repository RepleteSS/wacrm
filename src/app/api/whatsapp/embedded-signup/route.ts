import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'
import { resolveVerifyTokenForSave } from '@/lib/whatsapp/verify-token'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')
const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

function supabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

/**
 * POST /api/whatsapp/embedded-signup
 *
 * Exchanges the code from Meta WhatsApp Embedded Signup for an Access Token,
 * retrieves/confirms the WABA ID and Phone Number ID, subscribes the WABA to our App,
 * and saves/encrypts the credentials into whatsapp_config.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { error: t('common.profileNotLinked') },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { code, waba_id, phone_number_id, pin } = body

    if (!code) {
      return NextResponse.json(
        { error: 'Authorization code is required from Meta Embedded Signup.' },
        { status: 400 }
      )
    }

    // Optional 2FA PIN, collected in the One-Click card so /register can
    // run in this same call — no second trip through Save Configuration.
    if (pin !== undefined && pin !== null && pin !== '') {
      if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
        return NextResponse.json(
          { error: 'Two-step verification PIN must be exactly 6 digits.' },
          { status: 400 }
        )
      }
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET

    if (!appId || !appSecret || appSecret === 'your-meta-app-secret') {
      return NextResponse.json(
        {
          error:
            'META_APP_ID and META_APP_SECRET must be configured in environment variables to use One-Click Embedded Signup.',
        },
        { status: 500 }
      )
    }

    // Step 1: Exchange code for Access Token
    const tokenUrl = `${META_API_BASE}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`
    const tokenRes = await fetch(tokenUrl)
    const tokenData = await tokenRes.json()

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[embedded-signup] Token exchange failed:', tokenData)
      return NextResponse.json(
        {
          error:
            tokenData.error?.message ||
            'Failed to exchange authorization code with Meta. Please check your App Secret or try again.',
        },
        { status: 400 }
      )
    }

    const accessToken = tokenData.access_token as string

    // Step 2: Resolve Phone Number ID & WABA ID if not provided by the frontend sessionInfo
    let resolvedWabaId = waba_id
    let resolvedPhoneNumberId = phone_number_id

    if (!resolvedWabaId || !resolvedPhoneNumberId) {
      // Query debug_token to find granular scopes and target WABA
      const debugUrl = `${META_API_BASE}/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
      const debugRes = await fetch(debugUrl)
      const debugData = await debugRes.json()

      const granularScopes = debugData.data?.granular_scopes || []
      const wabaScope = granularScopes.find(
        (s: { scope: string; target_ids?: string[] }) =>
          s.scope === 'whatsapp_business_management'
      )
      if (wabaScope?.target_ids?.[0]) {
        resolvedWabaId = resolvedWabaId || wabaScope.target_ids[0]
      }
    }

    if (!resolvedPhoneNumberId && resolvedWabaId) {
      // List phone numbers under the WABA
      const numbersUrl = `${META_API_BASE}/${resolvedWabaId}/phone_numbers`
      const numbersRes = await fetch(numbersUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const numbersData = await numbersRes.json()
      if (numbersData.data && numbersData.data.length > 0) {
        resolvedPhoneNumberId = numbersData.data[0].id
      }
    }

    if (!resolvedPhoneNumberId) {
      return NextResponse.json(
        {
          error:
            'Could not determine Phone Number ID from the WhatsApp Account. Please ensure a phone number was selected in the popup.',
        },
        { status: 400 }
      )
    }

    // Check if phone_number_id is already claimed by another account
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', resolvedPhoneNumberId)
      .neq('account_id', accountId)
      .maybeSingle()

    if (claimedError) {
      console.error('[embedded-signup] Error checking phone_number_id ownership:', claimedError)
      return NextResponse.json(
        { error: t('whatsappConfig.validateFailed') },
        { status: 500 }
      )
    }

    if (claimed) {
      return NextResponse.json(
        { error: t('whatsappConfig.numberLinkedElsewhere') },
        { status: 409 }
      )
    }

    // Lookup existing config for this account (needed for verify_token)
    const { data: existing } = await supabase
      .from('whatsapp_config')
      .select('id, verify_token')
      .eq('account_id', accountId)
      .maybeSingle()

    // Step 3: Verify phone number details
    let phoneInfo
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId: resolvedPhoneNumberId,
        accessToken,
      })
    } catch (err) {
      console.error('[embedded-signup] verifyPhoneNumber failed:', err)
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : 'Failed to verify phone number with Meta.',
        },
        { status: 400 }
      )
    }

    // Step 4: Subscribe WABA to this Meta app
    // This is REQUIRED for inbound webhooks — fail the save if it doesn't work
    let subscribedAppsAt: string | null = null
    if (resolvedWabaId) {
      try {
        await subscribeWabaToApp({
          wabaId: resolvedWabaId,
          accessToken,
        })
        subscribedAppsAt = new Date().toISOString()
      } catch (err) {
        console.error('[embedded-signup] subscribeWabaToApp failed:', err)
        return NextResponse.json(
          {
            error:
              err instanceof Error
                ? err.message
                : 'Failed to subscribe WhatsApp Business Account to this app. The token needs whatsapp_business_management permission and the System User must be assigned to the WABA.',
          },
          { status: 400 }
        )
      }
    }

    // Step 5: Configure Meta App webhook subscription for messages
    // This is REQUIRED for inbound webhooks — fail the save if it doesn't work
    const appToken = `${appId}|${appSecret}`
    const subUrl = `${META_API_BASE}/${appId}/subscriptions`
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (!siteUrl) {
      return NextResponse.json(
        {
          error:
            'NEXT_PUBLIC_SITE_URL must be configured in environment variables for webhook configuration.',
        },
        { status: 500 }
      )
    }
    const webhookCallback = `${siteUrl.replace(/\/$/, '')}/api/whatsapp/webhook`
    // Use the same verify token that will be stored in whatsapp_config
    const verifyTokenForWebhook = existing?.verify_token
      ? decrypt(existing.verify_token)
      : 'replete_wacrm_verify_token'

    try {
      // Create/update the app subscription
      const subBody = new URLSearchParams({
        object: 'whatsapp_business_account',
        callback_url: webhookCallback,
        verify_token: verifyTokenForWebhook,
        fields: 'messages',
      })
      const subRes = await fetch(subUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${appToken}` },
        body: subBody,
      })
      if (!subRes.ok) {
        const errData = await subRes.json().catch(() => ({}))
        console.error('[embedded-signup] App webhook subscription failed:', errData)
        return NextResponse.json(
          {
            error:
              `Failed to configure app webhook subscription: ${errData.error?.message || subRes.status}. ` +
              `Ensure META_APP_SECRET is correct and the app has WhatsApp Business API product added.`,
          },
          { status: 400 }
        )
      }

      // Verify the subscription was created by fetching current subscriptions
      const verifyRes = await fetch(subUrl, {
        headers: { Authorization: `Bearer ${appToken}` },
      })
      if (verifyRes.ok) {
        const verifyData = await verifyRes.json()
        const hasOurSubscription = verifyData.data?.some(
          (s: any) => s.callback_url === webhookCallback && s.fields?.includes('messages')
        )
        if (!hasOurSubscription) {
          console.warn('[embedded-signup] Subscription created but not found in list - may need manual verification')
        }
      }
      console.log('[embedded-signup] App webhook subscription configured successfully:', webhookCallback)
    } catch (e) {
      console.error('[embedded-signup] App webhook subscription error:', e)
      return NextResponse.json(
        {
          error:
            'Failed to configure app webhook subscription. Check server logs and ensure META_APP_SECRET is valid.',
        },
        { status: 400 }
      )
    }

    // Encrypt token
    const encryptedAccessToken = encrypt(accessToken)
    const encryptedVerifyToken = existing?.verify_token
      ? existing.verify_token
      : encrypt('replete_wacrm_verify_token')

    // Step 6: Register the phone number for inbound webhooks (POST /register).
    // Skipped when no PIN was supplied — credentials are still saved and the
    // response tells the UI to collect the PIN later via Save Configuration.
    let registeredAt: string | null = null
    let registrationError: string | null = null
    if (pin) {
      try {
        await registerPhoneNumber({
          phoneNumberId: resolvedPhoneNumberId,
          accessToken,
          pin,
        })
        registeredAt = new Date().toISOString()
      } catch (err) {
        // Save the credentials anyway (so the OAuth token isn't lost) and
        // report the specific reason — mirrors the regular config save.
        registrationError = err instanceof Error ? err.message : 'Failed to register the phone number.'
        console.error('[embedded-signup] registerPhoneNumber failed:', registrationError)
      }
    }

    const baseRow = {
      phone_number_id: resolvedPhoneNumberId,
      waba_id: resolvedWabaId || null,
      access_token: encryptedAccessToken,
      verify_token: encryptedVerifyToken,
      status: registrationError ? 'disconnected' : 'connected',
      connected_at: registrationError ? null : new Date().toISOString(),
      // Only set when /register actually ran AND succeeded — the UI reads
      // this to decide inbound messages are live.
      registered_at: registeredAt,
      subscribed_apps_at: subscribedAppsAt,
      last_registration_error: registrationError,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('whatsapp_config')
        .update(baseRow)
        .eq('account_id', accountId)

      if (updateError) {
        console.error('[embedded-signup] Error updating whatsapp_config:', updateError)
        return NextResponse.json(
          { error: t('whatsappConfig.updateFailed') },
          { status: 500 }
        )
      }
    } else {
      const { error: insertError } = await supabase
        .from('whatsapp_config')
        .insert({
          account_id: accountId,
          user_id: user.id,
          ...baseRow,
        })

      if (insertError) {
        console.error('[embedded-signup] Error inserting whatsapp_config:', insertError)
        return NextResponse.json(
          { error: t('whatsappConfig.saveFailed') },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      connected: true,
      // registered=true only when /register ran with the supplied PIN —
      // inbound messages are then live immediately.
      registered: registeredAt != null,
      // True when registration was skipped (no PIN supplied) rather than failed.
      registration_skipped: !pin && !registrationError,
      ...(registrationError ? { registration_error: registrationError } : {}),
      phone_info: phoneInfo,
      waba_id: resolvedWabaId,
      phone_number_id: resolvedPhoneNumberId,
    })
  } catch (error) {
    console.error('Error in WhatsApp embedded signup handler:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : t('common.internalServerError'),
      },
      { status: 500 }
    )
  }
}
