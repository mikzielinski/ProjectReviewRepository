import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import './HomePage.css'

interface HomeStats {
  devProjects: number
  complianceProjects: number
  openControls: number
}

const FRAMEWORKS = [
  { id: 'iso27001', label: 'ISO 27001', abbr: 'ISO' },
  { id: 'soc2', label: 'SOC 2', abbr: 'SOC' },
  { id: 'sox', label: 'SOX', abbr: 'SOX' },
  { id: 'hipaa', label: 'HIPAA', abbr: 'HIPAA' },
  { id: 'eu_ai_act', label: 'EU AI Act', abbr: 'AI' },
]

const FEATURES = [
  {
    icon: '📚',
    title: 'Controls Library',
    description:
      'Centralized catalog of security and compliance controls mapped to ISO, SOC 2, HIPAA, and EU AI Act frameworks.',
  },
  {
    icon: '📋',
    title: 'Audit Trail',
    description:
      'Immutable activity log across projects, documents, and control assignments — ready for internal and external audits.',
  },
  {
    icon: '👥',
    title: 'RACI & Tasks',
    description:
      'Assign ownership, track deliverables, and manage review cycles with clear accountability across teams.',
  },
  {
    icon: '🏗️',
    title: 'Framework Management',
    description:
      'Configure compliance frameworks, control domains, and project templates from a single governance hub.',
  },
]

function HomeContent() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<HomeStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    if (!user) return

    setStatsLoading(true)
    Promise.allSettled([
      api.get('/dashboard/it-portfolio'),
      api.get('/projects/my-projects', { params: { category: 'COMPLIANCE' } }),
      api.get('/auditor/overview'),
    ])
      .then(([portfolio, compliance, auditor]) => {
        const devProjects =
          portfolio.status === 'fulfilled' ? portfolio.value.data?.total_projects ?? 0 : 0
        const complianceProjects =
          compliance.status === 'fulfilled'
            ? (compliance.value.data?.length ?? 0)
            : 0
        const openControls =
          auditor.status === 'fulfilled'
            ? auditor.value.data?.total_control_assignments ?? 0
            : 0
        setStats({ devProjects, complianceProjects, openControls })
      })
      .finally(() => setStatsLoading(false))
  }, [user?.id])

  const goTo = (path: string) => {
    if (user) {
      navigate(path)
    } else {
      navigate('/login')
    }
  }

  const firstName = user?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-bg" aria-hidden="true" />
        <div className="home-hero-inner">
          <span className="home-eyebrow">SDLC Governance</span>
          <h1 className="home-hero-title">
            Unified portal for IT delivery &amp; compliance
          </h1>
          <p className="home-hero-sub">
            Manage development projects, security controls, audit evidence, and
            regulatory frameworks — ISO 27001, SOC 2, HIPAA, and EU AI Act — in
            one governed workspace.
          </p>

          {user ? (
            <div className="home-welcome-block">
              <p className="home-welcome-text">
                Welcome back, <strong>{firstName}</strong>
              </p>
              {statsLoading ? (
                <div className="home-stats home-stats--loading">Loading your overview…</div>
              ) : stats ? (
                <div className="home-stats">
                  <div className="home-stat">
                    <span className="home-stat-value">{stats.devProjects}</span>
                    <span className="home-stat-label">Dev projects</span>
                  </div>
                  <div className="home-stat">
                    <span className="home-stat-value">{stats.complianceProjects}</span>
                    <span className="home-stat-label">Compliance projects</span>
                  </div>
                  <div className="home-stat">
                    <span className="home-stat-value">{stats.openControls}</span>
                    <span className="home-stat-label">Control assignments</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="home-hero-actions">
              <Link to="/login" className="home-btn home-btn--primary">
                Sign in to get started
              </Link>
              <button
                type="button"
                className="home-btn home-btn--ghost"
                onClick={() => document.getElementById('home-paths')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Explore the platform
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="home-frameworks">
        <p className="home-frameworks-label">Supported frameworks</p>
        <div className="home-framework-badges">
          {FRAMEWORKS.map((fw) => (
            <span key={fw.id} className="home-framework-badge" title={fw.label}>
              <span className="home-framework-abbr">{fw.abbr}</span>
              <span className="home-framework-name">{fw.label}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="home-section" id="home-paths">
        <h2 className="home-section-title">Choose your workspace</h2>
        <p className="home-section-sub">
          Two integrated paths for delivery teams and compliance stakeholders.
        </p>
        <div className="home-paths">
          <button
            type="button"
            className="home-path-card home-path-card--dev"
            onClick={() => goTo('/projects')}
          >
            <span className="home-path-icon" aria-hidden="true">💻</span>
            <h3>Dev Projects</h3>
            <p>
              SDLC documentation, templates, folder governance, and IT portfolio
              tracking for software delivery teams.
            </p>
            <span className="home-path-cta">
              {user ? 'Open Dev Projects →' : 'Sign in to access →'}
            </span>
          </button>
          <button
            type="button"
            className="home-path-card home-path-card--compliance"
            onClick={() => goTo('/compliance')}
          >
            <span className="home-path-icon" aria-hidden="true">🛡️</span>
            <h3>Compliance &amp; Security</h3>
            <p>
              Control assignments, gap analysis, audit schedules, and framework
              alignment for security and regulatory programs.
            </p>
            <span className="home-path-cta">
              {user ? 'Open Compliance →' : 'Sign in to access →'}
            </span>
          </button>
        </div>
      </section>

      <section className="home-section home-section--features">
        <h2 className="home-section-title">Built for governed delivery</h2>
        <p className="home-section-sub">
          Everything you need to ship software with evidence and accountability.
        </p>
        <div className="home-features">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="home-feature-card">
              <span className="home-feature-icon" aria-hidden="true">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      {!user && (
        <section className="home-cta-banner">
          <div className="home-cta-inner">
            <h2>Ready to govern your SDLC?</h2>
            <p>Sign in to access projects, controls, and audit-ready documentation.</p>
            <Link to="/login" className="home-btn home-btn--primary home-btn--lg">
              Login
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}

function LandingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="home-landing-shell">
      <header className="home-topbar">
        <div className="home-topbar-brand">
          <span className="home-topbar-logo" aria-hidden="true">◆</span>
          <span>SDLC Governance</span>
        </div>
        <Link to="/login" className="home-topbar-login">
          Login
        </Link>
      </header>
      {children}
      <footer className="home-footer">
        <span>ProjectReviewRepository · SDLC Governance Portal</span>
      </footer>
    </div>
  )
}

export default function HomePage() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="home-loading">
        <div className="home-loading-spinner" />
      </div>
    )
  }

  if (user) {
    return (
      <Layout>
        <HomeContent />
      </Layout>
    )
  }

  return (
    <LandingShell>
      <HomeContent />
    </LandingShell>
  )
}
