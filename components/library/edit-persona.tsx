'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, TrashSimple } from '@phosphor-icons/react'
import type { Advisor, AdvisorDocument } from '@/lib/quorum/types'
import { api } from '@/lib/client-api'
import { Dialog } from '@/components/ui/dialog'

/**
 * Edit persona: the card's fields, the expertise ratings, the voice, and the
 * knowledge base (text documents: pick a file, or paste). Documents save
 * immediately; the fields save on "Save persona".
 */
export function EditPersona({ advisor, onClose, onSaved }: { advisor: Advisor; onClose: () => void; onSaved: (a: Advisor) => void }) {
  const [form, setForm] = useState({
    name: advisor.name,
    role: advisor.role,
    bio: advisor.bio,
    temperament: advisor.temperament,
    instructions: advisor.instructions,
    strengths: [0, 1, 2].map((i) => advisor.strengths[i] ?? { s: '', lv: 3 }),
  })
  const [docs, setDocs] = useState<AdvisorDocument[] | null>(null)
  const [doc, setDoc] = useState({ title: '', category: '', content: '' })
  const [busy, setBusy] = useState<'save' | 'doc' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    api.advisors.get(advisor.id).then((r) => {
      if (!alive) return
      if (r.ok) setDocs(r.data.documents)
      else setError(r.message)
    })
    return () => {
      alive = false
    }
  }, [advisor.id])

  async function save() {
    if (busy) return
    setBusy('save')
    setError(null)
    const r = await api.advisors.update(advisor.id, {
      name: form.name,
      role: form.role,
      bio: form.bio,
      temperament: form.temperament,
      instructions: form.instructions,
      strengths: form.strengths.filter((s) => s.s.trim()).map((s) => ({ s: s.s.trim(), lv: Number(s.lv) })),
    })
    setBusy(null)
    if (!r.ok) {
      setError(r.message)
      return
    }
    onSaved(r.data.advisor)
    onClose()
  }

  async function addDoc() {
    if (busy || !doc.title.trim() || !doc.content.trim()) return
    setBusy('doc')
    setError(null)
    const r = await api.documents.add(advisor.id, doc)
    setBusy(null)
    if (!r.ok) {
      setError(r.message)
      return
    }
    setDocs((ds) => [...(ds ?? []).filter((d) => d.title !== r.data.document.title), r.data.document])
    setDoc({ title: '', category: '', content: '' })
    // The card's "Grounded in" line changes with the documents.
    const fresh = await api.advisors.get(advisor.id)
    if (fresh.ok) onSaved(fresh.data.advisor)
  }

  async function removeDoc(d: AdvisorDocument) {
    if (busy) return
    setBusy('doc')
    const r = await api.documents.remove(advisor.id, d.id)
    setBusy(null)
    if (!r.ok) {
      setError(r.message)
      return
    }
    setDocs((ds) => (ds ?? []).filter((x) => x.id !== d.id))
    const fresh = await api.advisors.get(advisor.id)
    if (fresh.ok) onSaved(fresh.data.advisor)
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((content) => setDoc((d) => ({ ...d, title: d.title || file.name.replace(/\.(md|txt|markdown)$/i, ''), content })))
    e.target.value = ''
  }

  const invalid = !form.name.trim() || !form.role.trim()

  return (
    <Dialog
      title={`Edit ${advisor.firstName}`}
      onClose={onClose}
      wide
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={invalid || busy !== null}>
            {busy === 'save' ? 'Saving…' : 'Save persona'}
          </button>
        </>
      }
    >
      <div className="dialog-fields">
        <div className="field">
          <label htmlFor="ep-name">Name</label>
          <input id="ep-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ep-role">Domain</label>
          <input id="ep-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ep-bio">Bio</label>
          <textarea id="ep-bio" className="input" rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ep-temp">Temperament</label>
          <input id="ep-temp" className="input" value={form.temperament} onChange={(e) => setForm({ ...form, temperament: e.target.value })} placeholder="e.g. Direct, numbers-first" />
        </div>
        <div className="field">
          <label>Expertise — up to three subjects, rated 1–5</label>
          <div className="dialog-fields" style={{ gap: 'var(--space-2)' }}>
            {form.strengths.map((s, i) => (
              <div className="strength-row" key={i}>
                <input
                  className="input"
                  value={s.s}
                  placeholder={i === 0 ? 'e.g. Fundraising' : 'Subject'}
                  onChange={(e) => setForm({ ...form, strengths: form.strengths.map((x, j) => (j === i ? { ...x, s: e.target.value } : x)) })}
                  aria-label={`Subject ${i + 1}`}
                />
                <select
                  className="input"
                  value={s.lv}
                  onChange={(e) => setForm({ ...form, strengths: form.strengths.map((x, j) => (j === i ? { ...x, lv: Number(e.target.value) } : x)) })}
                  aria-label={`Rating ${i + 1}`}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} / 5
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="ep-instr">How this advisor thinks and speaks (goes into the persona prompt)</label>
          <textarea id="ep-instr" className="input" rows={4} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="What they always ask first, what they distrust, how they sound." />
        </div>

        <div className="hr" />

        <div className="field">
          <label>Knowledge base — {docs ? `${docs.length} ${docs.length === 1 ? 'document' : 'documents'}` : '…'}</label>
          <div className="doc-list">
            {docs?.map((d) => (
              <div className="doc-row" key={d.id}>
                <span className="title">{d.title}</span>
                <span className="sub">
                  {d.category ? `${d.category} · ` : ''}
                  {d.chars.toLocaleString()} chars
                </span>
                <button className="btn btn-ghost btn-sm muted" onClick={() => removeDoc(d)} disabled={busy !== null} aria-label={`Remove ${d.title}`}>
                  <TrashSimple size={14} />
                </button>
              </div>
            ))}
            {docs && docs.length === 0 && <div className="help">Not yet grounded. Add a text or markdown document below.</div>}
          </div>
        </div>
        <div className="doc-add">
          <input className="input" value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} placeholder="Document title" aria-label="Document title" />
          <input className="input" value={doc.category} onChange={(e) => setDoc({ ...doc, category: e.target.value })} placeholder="Source type, e.g. board memo" aria-label="Source type" />
          <textarea className="input full" rows={3} value={doc.content} onChange={(e) => setDoc({ ...doc, content: e.target.value })} placeholder="Paste the text, or pick a .md / .txt file." aria-label="Document text" />
          <div className="actions full">
            <input ref={fileRef} type="file" accept=".md,.txt,.markdown,text/plain,text/markdown" hidden onChange={pickFile} />
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              Pick a file
            </button>
            <button className="btn btn-primary btn-sm" onClick={addDoc} disabled={busy !== null || !doc.title.trim() || !doc.content.trim()}>
              <Plus size={14} />
              {busy === 'doc' ? 'Saving…' : 'Add document'}
            </button>
          </div>
        </div>
        {error && <div className="msg warn">{error}</div>}
      </div>
    </Dialog>
  )
}
