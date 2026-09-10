'use client'

import { useEffect, useState } from 'react'
import { ClockCounterClockwise, Files, PencilSimple, Plus, SlidersHorizontal, TrashSimple } from '@phosphor-icons/react'
import type { Advisor } from '@/lib/quorum/types'
import { primarySegment } from '@/lib/quorum/text'
import { api } from '@/lib/client-api'
import { Avatar } from '@/components/ui/avatar'
import { Meter } from '@/components/ui/meter'
import { Dialog } from '@/components/ui/dialog'
import { EditPersona } from './edit-persona'

/** Screen 5 — the persona library (admin). */
export function Library() {
  const [roster, setRoster] = useState<Advisor[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [np, setNp] = useState({ name: '', role: '', bio: '' })
  const [busy, setBusy] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.advisors.list().then((r) => {
      if (!alive) return
      if (r.ok) setRoster(r.data.advisors)
      else setError(r.message)
    })
    return () => {
      alive = false
    }
  }, [])

  const npInvalid = !np.name.trim() || !np.role.trim()

  async function createPersona() {
    if (npInvalid || busy) return
    setBusy(true)
    setError(null)
    const r = await api.advisors.create({
      name: np.name,
      role: np.role,
      bio: np.bio,
      // The domain's first segment becomes a level-3 strength (spec §5).
      strengths: [{ s: primarySegment(np.role), lv: 3 }],
    })
    setBusy(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
    setRoster((rs) => [...(rs ?? []), r.data.advisor])
    setNewOpen(false)
    setNp({ name: '', role: '', bio: '' })
  }

  async function confirmRemove() {
    if (!removeId || busy) return
    setBusy(true)
    const r = await api.advisors.remove(removeId)
    setBusy(false)
    if (!r.ok) {
      setError(r.message)
      return
    }
    setRoster((rs) => (rs ?? []).filter((a) => a.id !== removeId))
    setRemoveId(null)
  }

  const removing = roster?.find((a) => a.id === removeId)
  const editing = roster?.find((a) => a.id === editId)

  return (
    <div className="page library">
      <div className="library-head">
        <div>
          <div className="kicker">Admin · Persona library</div>
          <h2 className="h2">The people behind the board.</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
          <Plus size={15} />
          New persona
        </button>
      </div>
      {error && <div className="msg warn">{error}</div>}
      {roster && roster.length === 0 && <div className="empty">No personas yet. Create the first one.</div>}

      <div className="persona-grid">
        {roster?.map((p) => (
          <div className="card elev-sm persona-card" key={p.id}>
            <div className="card-head">
              <Avatar initials={p.initials} size={34} />
              <div className="who">
                <div className="card-title">{p.name}</div>
                <div className="persona-role">{p.role}</div>
              </div>
              <span className="tag tag-neutral">Live</span>
            </div>
            <Meter strengths={p.strengths} />
            <div className="meta">
              <div>
                <Files size={14} />
                Grounded in {p.sources}
              </div>
              <div>
                <SlidersHorizontal size={14} />
                Temperament: {p.temperament || 'Not yet configured'}
              </div>
              <div>
                <ClockCounterClockwise size={14} />
                Edited {p.edited}
              </div>
            </div>
            <div className="actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditId(p.id)}>
                <PencilSimple size={14} />
                Edit persona
              </button>
              <button className="btn btn-ghost btn-sm muted" onClick={() => setRemoveId(p.id)}>
                <TrashSimple size={14} />
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {newOpen && (
        <Dialog
          title="New persona"
          onClose={() => setNewOpen(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setNewOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={createPersona} disabled={npInvalid || busy}>
                <Plus size={15} />
                {busy ? 'Creating…' : 'Create persona'}
              </button>
            </>
          }
        >
          <div className="dialog-fields">
            <div className="field">
              <label htmlFor="np-name">Name</label>
              <input id="np-name" className="input" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} placeholder="e.g. Priya Nair" autoFocus />
            </div>
            <div className="field">
              <label htmlFor="np-role">Domain</label>
              <input id="np-role" className="input" value={np.role} onChange={(e) => setNp({ ...np, role: e.target.value })} placeholder="e.g. Security & Infrastructure" />
            </div>
            <div className="field">
              <label htmlFor="np-bio">Bio</label>
              <textarea id="np-bio" className="input" rows={2} value={np.bio} onChange={(e) => setNp({ ...np, bio: e.target.value })} placeholder="One or two sentences on who this advisor is and how they think." />
            </div>
            <div className="dialog-note">New personas start ungrounded — attach documents after creating to give them a knowledge base.</div>
          </div>
        </Dialog>
      )}

      {removing && (
        <Dialog
          title={`Remove ${removing.name}?`}
          onClose={() => setRemoveId(null)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setRemoveId(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmRemove} disabled={busy}>
                <TrashSimple size={15} />
                {busy ? 'Removing…' : 'Remove'}
              </button>
            </>
          }
        >
          <div className="dialog-body">The persona leaves the board immediately. Its private chats and past session contributions stay on the record.</div>
        </Dialog>
      )}

      {editing && (
        <EditPersona
          advisor={editing}
          onClose={() => setEditId(null)}
          onSaved={(a) => setRoster((rs) => (rs ?? []).map((x) => (x.id === a.id ? a : x)))}
        />
      )}
    </div>
  )
}
