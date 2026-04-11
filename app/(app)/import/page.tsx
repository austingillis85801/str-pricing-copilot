'use client'

import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/components/toast'
import type { Property, ImportResult } from '@/lib/types'

type ImportPlatform = 'airbnb' | 'vrbo'

interface SectionState {
  platform: ImportPlatform
  file: File | null
  detectedListings: string[]   // listing names found in the CSV (Airbnb only)
  selectedListing: string      // '' = import all, otherwise the chosen listing name
  loading: boolean
  result: ImportResult | null
  error: string | null
}

// ─────────────────────────────────────────────
// Lightweight client-side CSV listing detector
// ─────────────────────────────────────────────

/** Proper quoted-CSV line parser — handles commas inside quoted fields */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

function extractListingNames(csvText: string): string[] {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return []

  // Find the "Listing" header index using proper CSV parsing
  const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const listingIdx = headers.indexOf('listing')
  if (listingIdx === -1) return []

  const names = new Set<string>()
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = parseCsvLine(line)
    const name = cols[listingIdx]?.trim()
    if (name) names.add(name)
  }
  return Array.from(names).sort()
}

// ─────────────────────────────────────────────
// Import section component
// ─────────────────────────────────────────────

function ImportSection({
  property,
  state,
  onChange,
  onImport,
}: {
  property: Property
  state: SectionState
  onChange: (updated: Partial<SectionState>) => void
  onImport: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (f: File | null) => {
    if (!f || state.platform !== 'airbnb') {
      onChange({ file: f, detectedListings: [], selectedListing: '', result: null, error: null })
      return
    }
    // Read the CSV client-side to detect listing names
    const text = await f.text()
    const listings = extractListingNames(text)
    onChange({
      file: f,
      detectedListings: listings,
      // Auto-select if only one listing found, otherwise let the user pick
      selectedListing: listings.length === 1 ? listings[0] : '',
      result: null,
      error: null,
    })
  }

  const showListingPicker = state.platform === 'airbnb' && state.detectedListings.length > 1

  return (
    <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-white">{property.name}</h2>
          <p className="text-slate-400 text-sm mt-0.5">{property.location}</p>
        </div>
        <div className="shrink-0">
          <select
            value={state.platform}
            onChange={e => onChange({ platform: e.target.value as ImportPlatform, file: null, detectedListings: [], selectedListing: '', result: null, error: null })}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="airbnb">Airbnb CSV</option>
            <option value="vrbo">Vrbo CSV</option>
          </select>
        </div>
      </div>

      {/* Platform instructions */}
      <div className="bg-slate-800/50 rounded-lg px-4 py-3 mb-4 text-xs text-slate-400 border border-slate-700/40">
        {state.platform === 'airbnb' ? (
          <>
            <span className="font-medium text-slate-300">Airbnb:</span> In your Host dashboard go to <span className="text-slate-300">Menu → Reservations</span>, then click <span className="text-slate-300">Export to CSV</span>. The report should include columns for Confirmation code, Start date, End date, # of nights, Earnings, Status, and Listing. If your account has multiple properties, the file will contain all of them — use the listing selector below to import one at a time.
          </>
        ) : (
          <>
            <span className="font-medium text-slate-300">Vrbo:</span> Export the &quot;Booking Summary&quot; report from your Owner dashboard. Make sure it includes Confirmation number, Check-in, Check-out, Gross earnings, and Status columns.
          </>
        )}
      </div>

      {/* File upload */}
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors duration-150 mb-4 ${
          state.file
            ? 'border-blue-500/50 bg-blue-600/5'
            : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/30'
        }`}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
        />
        {state.file ? (
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-blue-400 text-sm font-medium">{state.file.name}</span>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange({ file: null, detectedListings: [], selectedListing: '', result: null, error: null }) }}
              className="text-slate-500 hover:text-slate-300 ml-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <svg className="w-8 h-8 text-slate-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <p className="text-slate-400 text-sm">Click to select a .csv file</p>
          </>
        )}
      </div>

      {/* Listing selector — shown when CSV has multiple listings */}
      {showListingPicker && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Multiple listings detected — select which one to import
          </label>
          <select
            value={state.selectedListing}
            onChange={e => onChange({ selectedListing: e.target.value, result: null, error: null })}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">— Choose a listing —</option>
            {state.detectedListings.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1.5">
            Import one listing at a time so bookings are matched to the correct property.
          </p>
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
          {state.error}
        </div>
      )}

      {/* Result */}
      {state.result && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <p className="text-emerald-400 font-medium text-sm mb-2">
            Import complete — {state.result.propertyName} · {state.result.platform}
          </p>
          <ul className="space-y-1 text-sm">
            <li className="flex items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              {state.result.newBookings} new booking{state.result.newBookings !== 1 ? 's' : ''} added
            </li>
            <li className="flex items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
              {state.result.updatedBookings} existing booking{state.result.updatedBookings !== 1 ? 's' : ''} updated
            </li>
            <li className="flex items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              {state.result.cancelledBookings} booking{state.result.cancelledBookings !== 1 ? 's' : ''} marked as cancelled
            </li>
          </ul>
        </div>
      )}

      <button
        onClick={onImport}
        disabled={!state.file || state.loading || (showListingPicker && !state.selectedListing)}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors duration-150"
      >
        {state.loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Importing...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </>
        )}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function ImportPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()

  const [sections, setSections] = useState<Record<string, SectionState>>({})

  useEffect(() => {
    fetch('/api/properties')
      .then(r => r.json())
      .then((props: Property[]) => {
        setProperties(props)
        const initial: Record<string, SectionState> = {}
        for (const p of props) {
          initial[p.id] = {
            platform: 'airbnb',
            file: null,
            detectedListings: [],
            selectedListing: '',
            loading: false,
            result: null,
            error: null,
          }
        }
        setSections(initial)
      })
      .catch(() => showToast('Failed to load properties', 'error'))
      .finally(() => setLoading(false))
  }, [showToast])

  const updateSection = (propertyId: string, update: Partial<SectionState>) => {
    setSections(prev => ({ ...prev, [propertyId]: { ...prev[propertyId], ...update } }))
  }

  const handleImport = async (property: Property) => {
    const section = sections[property.id]
    if (!section?.file) return

    // If multiple listings detected and none selected, block the import
    if (section.detectedListings.length > 1 && !section.selectedListing) {
      updateSection(property.id, { error: 'Please select which listing to import.' })
      return
    }

    updateSection(property.id, { loading: true, error: null, result: null })

    const formData = new FormData()
    formData.append('file', section.file)
    formData.append('propertyId', property.id)
    formData.append('platform', section.platform)
    if (section.selectedListing) {
      formData.append('listingName', section.selectedListing)
    }

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      updateSection(property.id, { result: data, loading: false })
      showToast(`Import complete for ${property.name}`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      updateSection(property.id, { error: msg, loading: false })
      showToast(msg, 'error')
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Import Data</h1>
        <p className="text-slate-400 mt-1">Upload booking CSV exports from Airbnb or Vrbo</p>
      </div>

      {properties.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center bg-[#1e293b] rounded-2xl border border-slate-700/50 p-8">
          <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-white font-medium mb-1">No properties configured</p>
          <p className="text-slate-400 text-sm">Set up your properties in Settings first, then come back to import data.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {properties.map(property => (
            <ImportSection
              key={property.id}
              property={property}
              state={sections[property.id] ?? {
                platform: 'airbnb',
                file: null,
                detectedListings: [],
                selectedListing: '',
                loading: false,
                result: null,
                error: null,
              }}
              onChange={update => updateSection(property.id, update)}
              onImport={() => handleImport(property)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
