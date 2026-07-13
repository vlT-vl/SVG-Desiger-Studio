import { useEffect, useState } from 'react'
import vltcube from '../../res/vltcube.svg?url'
import '../styles/VltLogo.css'

function normalizeTheme(theme) {
  return theme === 'light' || theme === 'dark' ? theme : null
}

function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getDocumentTheme() {
  if (typeof document === 'undefined') return getSystemTheme()
  const root = document.documentElement
  const theme = normalizeTheme(root.dataset.theme)
  if (theme) return theme
  const preference = normalizeTheme(root.dataset.themePreference)
  return preference ?? getSystemTheme()
}

function useVltLogoTheme(theme) {
  const explicitTheme = normalizeTheme(theme)
  const [resolvedTheme, setResolvedTheme] = useState(() => explicitTheme ?? getDocumentTheme())

  useEffect(() => {
    if (explicitTheme) {
      setResolvedTheme(explicitTheme)
      return undefined
    }

    const updateTheme = () => setResolvedTheme(getDocumentTheme())
    updateTheme()

    let observer = null
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(updateTheme)
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-preference'] })
    }

    const media = typeof window !== 'undefined'
      ? window.matchMedia?.('(prefers-color-scheme: dark)')
      : null
    if (media?.addEventListener) {
      media.addEventListener('change', updateTheme)
    } else {
      media?.addListener?.(updateTheme)
    }

    return () => {
      observer?.disconnect()
      if (media?.removeEventListener) {
        media.removeEventListener('change', updateTheme)
      } else {
        media?.removeListener?.(updateTheme)
      }
    }
  }, [explicitTheme])

  return resolvedTheme
}

export function VltLogo({
  size = '1.75rem',
  staticExpanded = false,
  className = '',
  title = 'vlT',
  theme = 'auto',
  lightText = '#17181a',
  darkText = '#ffffff',
}) {
  const resolvedTheme = useVltLogoTheme(theme)
  const themeStyle = {
    '--vlt-logo-text': resolvedTheme === 'dark' ? darkText : lightText,
  }

  const logoClasses = [
    'vlt-logo',
    staticExpanded && 'vlt-logo--static',
    !staticExpanded && className,
  ].filter(Boolean).join(' ')

  const logo = (
    <div
      className={logoClasses}
      style={staticExpanded ? themeStyle : { '--vlt-cube-w': size, ...themeStyle }}
      aria-label={title}
      role="img"
    >
      <img className="vlt-logo__cube" src={vltcube} alt="" aria-hidden="true" />
      <span className="vlt-logo__text">vlT</span>
    </div>
  )

  if (staticExpanded) {
    return (
      <div
        className={['vlt-logo-static-wrap', className].filter(Boolean).join(' ')}
        style={{ '--vlt-cube-w': size, ...themeStyle }}
      >
        {logo}
      </div>
    )
  }

  return logo
}
