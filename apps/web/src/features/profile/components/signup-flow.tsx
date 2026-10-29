'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useAction } from 'next-safe-action/hooks'
import { Lock } from 'lucide-react'
import { SignupHeader, SignupKicker } from '@/features/auth/components/signup-header'
import { TEAMS } from '@/features/teams/data'
import { createProfileAction } from '../server/actions'
import { BirthDateFields } from './birth-date-fields'
import { ClubCarousel } from './club-carousel'

type Step = 'phone' | 'club' | 'confirm'

/**
 * Sign-up steps 2 and 3 (owner, 2026-10-13). Step 2, the phone check, is shown but not live yet: SMS is
 * switched on later, and then a verified phone becomes required (one phone = one fan). Step 3 picks the club
 * from a carousel (country row first; Israel only for now) and a nickname, then a final "for life" check.
 */
export function SignupFlow({ next }: { next?: string }) {
  const t = useTranslations('signup')
  const [step, setStep] = useState<Step>('phone')
  const [club, setClub] = useState(0)
  const [nick, setNick] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [accepted, setAccepted] = useState(false)
  const { execute, result, isPending } = useAction(createProfileAction)
  const team = TEAMS[club]!
  const error =
    result.serverError ??
    (result.data && 'error' in result.data ? result.data.error : undefined) ??
    result.validationErrors?.nick?._errors?.[0] ??
    result.validationErrors?.birthDate?._errors?.[0] ??
    result.validationErrors?.accept?._errors?.[0]

  const back = (to: Step) => (
    <button type="button" className="su-back" onClick={() => setStep(to)}>
      {t('back')}
    </button>
  )

  if (step === 'phone')
    return (
      <section className="su-step" key="phone">
        <SignupHeader step={2} />
        <div className="flex-1" />
        <SignupKicker n="02">{t('phoneVerify')}</SignupKicker>
        <h1 className="su-title">
          {t('onePerFan')}
          <span>{t('noDuplicates')}</span>
        </h1>
        <p className="su-lead">{t('smsNote')}</p>
        <div className="mt-6 space-y-3">
          <label className="su-field" data-off="true" dir="ltr">
            <span className="cc">
              +972
            </span>
            <input type="tel" inputMode="tel" placeholder="50-123-4567" disabled aria-label={t('phoneLabel')} />
            <span className="su-soon">{t('soon')}</span>
          </label>
          <button type="button" className="su-btn su-btn-blue" disabled>
            {t('sendCode')}
          </button>
          <button type="button" className="su-btn su-btn-ghost" onClick={() => setStep('club')}>
            {t('phoneSoonContinue')}
          </button>
        </div>
      </section>
    )

  if (step === 'club')
    return (
      <section className="su-step" key="club">
        <SignupHeader step={3} back={back('phone')} />
        <SignupKicker n="03">{t('yourClub')}</SignupKicker>
        <h1 className="su-title su-title-sm">{t('pickOnce')}</h1>

        <div className="su-row">
          <span>{t('country')}</span>
        </div>
        <div className="su-countries" role="radiogroup" aria-label={t('country')}>
          <button type="button" role="radio" aria-checked="true" className="su-country" data-on="true">
            <svg className="su-flag" width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
              <rect width="26" height="18" fill="#fff" />
              <rect y="2" width="26" height="2.6" fill="#0038b8" />
              <rect y="13.4" width="26" height="2.6" fill="#0038b8" />
              <path d="M13 5.2l3 5.2h-6zM13 12.8l-3-5.2h6z" fill="none" stroke="#0038b8" strokeWidth="0.9" />
            </svg>
            {t('israel')}
          </button>
          <span className="su-country" data-soon="true">
            {t('moreCountries')}
          </span>
        </div>

        <div className="su-row">
          <span>{t('premierLeague')}</span>
          <b aria-live="polite">{team.name}</b>
        </div>
        <ClubCarousel teams={TEAMS} index={club} onChange={setClub} />
        <div className="su-cdots" aria-hidden="true">
          {TEAMS.map((t, i) => (
            <i key={t.id} data-on={i === club} />
          ))}
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-[13px] text-muted">{t('nickPrompt')}</span>
          <span className="su-field">
            <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} placeholder={t('nickPlaceholder')} autoComplete="nickname" />
          </span>
        </label>
        {/* Birth date (owner, 2026-10-16): required, from 16; never shown to other fans. */}
        <div className="mt-4">
          <BirthDateFields initial={birthDate} onChange={setBirthDate} />
        </div>
        <div className="min-h-4 flex-1" />
        <button type="button" className="su-btn su-btn-green" disabled={nick.trim().length < 2 || !birthDate} onClick={() => setStep('confirm')}>
          {t('lockClub')}
        </button>
      </section>
    )

  return (
    <section className="su-step" key="confirm">
      <div className="flex-1" />
      <span className="su-lock" aria-hidden="true">
        <Lock className="size-5" />
      </span>
      <h1 className="su-title mt-4">
        {team.name}
        <span>{t('yourClubForever')}</span>
      </h1>
      <p className="su-note">
        {t.rich('cannotSwitch', { b: (c) => <b>{c}</b> })}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-live">
          {error}
        </p>
      )}
      <div className="flex-1" />
      <label className="su-consent">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required aria-required="true" />
        <span>
          {t.rich('agreeTo', {
            terms: (c) => (
              <Link href="/terms" target="_blank" rel="noopener">
                {c}
              </Link>
            ),
            privacy: (c) => (
              <Link href="/privacy" target="_blank" rel="noopener">
                {c}
              </Link>
            ),
          })}
        </span>
      </label>
      <button
        type="button"
        className="su-btn su-btn-green"
        disabled={isPending || !accepted}
        onClick={() => {
          if (accepted) execute({ teamId: team.id, nick, confirm: true, accept: true, birthDate, next })
        }}
      >
        {isPending ? t('saving') : t('yesMyClub')}
      </button>
      <button type="button" className="su-btn su-btn-ghost" onClick={() => setStep('club')}>
        {t('checkAgain')}
      </button>
    </section>
  )
}
