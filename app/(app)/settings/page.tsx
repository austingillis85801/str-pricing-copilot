'use client'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/components/toast'
import { AMENITIES } from '@/lib/types'
import type { Property, PropertyFormData, Platform, CsvImport } from '@/lib/types'
import { format } from 'date-fns'

const DEFAULT_MOAB: PropertyFormData = {
  name: 'Moab Property',
  location: 'Moab, UT',
  platform: 'both',
  base_price: 250,
  min_price: 150,
  max_price: 500,
  amenities: [],
  arches_timed_entry_active: false,
  notes: '',
}

const DEFAULT_BEAR_LAKE: PropertyFormData = {
  name: 'Bear Lake Property',
  location: 'Bear Lake / Garden City, UT',
  platform: 'both',
  base_price: 250,
  min_price: 150,
  max_price: 500,
  amenities: [],
  arches_timed_entry_active: false,
  notes: '',
}

function PropertyCard({
  title,
  data,
  isMoab,
  onChange,
  onSave,
  saving,
}: {
  title: string
  data: PropertyFormData
  isMoab: boolean
  onChange: (updated: PropertyFormData) => void
  onSave: () => void
  saving: boolean
}) {
  const toggle = (amenity: string) => {
    const updated = data.amenities.includes(amenity)
      ? data.amenities.filter(a => a !== amenity)
      : [...data.amenities, amenity]
    onChange({ ...data, amenities: updated })
  }

  return (
    <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6">
      <h2 className="text-lg font-semibold text-white mb-5">{title}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Property Name</label>
          <input
            type="text"
            value={data.name}
            onChange={e => onChange({ ...data, name: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Location</label>
          <input
            type="text"
            value={data.location}
            onChange={e => onChange({ ...data, location: e.target.value })}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Platform</label>
          <select
            value={data.platform}
            onChange={e => onChange({ ...data, platform: e.target.value as Platform })}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="airbnb">Airbnb</option>
            <option value="vrbo">Vrbo</option>
            <option value="both">Both</option>
          </select>
        </div>
      </div>

      {/* Pricing */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Base Price / Night</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              value={data.base_price}
              onChange={e => onChange({ ...data, base_price: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-7 pr-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Min Price / Night</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              value={data.min_price}
              onChange={e => onChange({ ...data, min_price: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-7 pr-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Max Price / Night</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              value={data.max_price}
              onChange={e => onChange({ ...data, max_price: Number(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg pl-7 pr-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Amenities */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-400 mb-2">Amenities</label>
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map(amenity => {
            const checked = data.amenities.includes(amenity)
            return (
              <button
                key={amenity}
                type="button"
                onClick={() => toggle(amenity)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 ${
                  checked
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                    : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white hover:border-slate-500'
                }`}
              >
                {amenity}
              </button>
            )
          })}
        </div>
      </div>

      {/* Moab-only: Arches toggle */}
      {isMoab && (
        <div className="mb-4 flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3 border border-slate-700/50">
          <div>
            <p className="text-sm font-medium text-white">Arches Timed Entry System Active</p>
            <p className="text-xs text-slate-400 mt-0.5">Affects pricing recommendations when entry permits are required</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...data, arches_timed_entry_active: !data.arches_timed_entry_active })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              data.arches_timed_entry_active ? 'bg-blue-600' : 'bg-slate-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                data.arches_timed_entry_active ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* Notes */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-slate-400 mb-1.5">Notes</label>
        <textarea
          value={data.notes}
          onChange={e => onChange({ ...data, notes: e.target.value })}
          rows={3}
          placeholder="Any additional notes about this property..."
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors duration-150"
      >
        {saving ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Saving...
          </>
        ) : (
          'Save changes'
        )}
      </button>
    </div>
  )
}

function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [moab, setMoab] = useState<PropertyFormData>(DEFAULT_MOAB)
  const [bearLake, setBearLake] = useState<PropertyFormData>(DEFAULT_BEAR_LAKE)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()

  const handleCreate = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: [moab, bearLake] }),
      })
      if (!res.ok) throw new Error('Failed to create properties')
      showToast('Properties created successfully!', 'success')
      onComplete()
    } catch {
      showToast('Failed to create properties. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600/20 rounded-xl mb-4">
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-white mb-2">Welcome to STR Pricing Co-Pilot</h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Let&apos;s set up your two properties before you get started. You can update these settings anytime.
        </p>
      </div>

      <div className="space-y-6">
        <PropertyCard
          title="Property 1 — Moab, UT"
          data={moab}
          isMoab={true}
          onChange={setMoab}
          onSave={handleCreate}
          saving={false}
        />
        <PropertyCard
          title="Property 2 — Bear Lake / Garden City, UT"
          data={bearLake}
          isMoab={false}
          onChange={setBearLake}
          onSave={handleCreate}
          saving={false}
        />

        <div className="flex justify-end">
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold rounded-lg px-6 py-3 text-sm transition-colors duration-150"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating properties...
              </>
            ) : (
              'Create properties & continue'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [properties, setProperties] = useState<Property[]>([])
  const [moab, setMoab] = useState<PropertyFormData>(DEFAULT_MOAB)
  const [bearLake, setBearLake] = useState<PropertyFormData>(DEFAULT_BEAR_LAKE)
  const [savingMoab, setSavingMoab] = useState(false)
  const [savingBearLake, setSavingBearLake] = useState(false)
  const [imports, setImports] = useState<CsvImport[]>([])
  const { showToast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [propsRes, importsRes] = await Promise.all([
        fetch('/api/properties'),
        fetch('/api/import'),
      ])
      if (propsRes.ok) {
        const data: Property[] = await propsRes.json()
        setProperties(data)
        const moabProp = data.find(p => p.location.toLowerCase().includes('moab'))
        const bearProp = data.find(p => !p.location.toLowerCase().includes('moab'))
        if (moabProp) setMoab({ ...moabProp })
        if (bearProp) setBearLake({ ...bearProp })
      }
      if (importsRes.ok) {
        const data: CsvImport[] = await importsRes.json()
        setImports(data)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const save = async (data: PropertyFormData, setSaving: (v: boolean) => void) => {
    setSaving(true)
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: [data] }),
      })
      if (!res.ok) throw new Error()
      showToast('Property saved successfully!', 'success')
      await loadData()
    } catch {
      showToast('Failed to save property. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (properties.length === 0) {
    return (
      <div className="p-6 md:p-8">
        <SetupWizard onComplete={loadData} />
      </div>
    )
  }

  const moabProp = properties.find(p => p.location.toLowerCase().includes('moab'))
  const bearProp = properties.find(p => !p.location.toLowerCase().includes('moab'))

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Configure your property details and pricing ranges</p>
      </div>

      <div className="space-y-6 mb-10">
        <PropertyCard
          title="Moab, UT"
          data={moab}
          isMoab={true}
          onChange={setMoab}
          onSave={() => save({ ...moab, id: moabProp?.id }, setSavingMoab)}
          saving={savingMoab}
        />
        <PropertyCard
          title="Bear Lake / Garden City, UT"
          data={bearLake}
          isMoab={false}
          onChange={setBearLake}
          onSave={() => save({ ...bearLake, id: bearProp?.id }, setSavingBearLake)}
          saving={savingBearLake}
        />
      </div>

      {/* Import history */}
      <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Import History</h2>
        {imports.length === 0 ? (
          <p className="text-slate-400 text-sm">No imports yet. Head to the Import page to upload your booking data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-700/50">
                  <th className="pb-3 text-xs font-medium text-slate-400">Date</th>
                  <th className="pb-3 text-xs font-medium text-slate-400">Property</th>
                  <th className="pb-3 text-xs font-medium text-slate-400">Platform</th>
                  <th className="pb-3 text-xs font-medium text-slate-400 text-right">Rows</th>
                  <th className="pb-3 text-xs font-medium text-slate-400 text-right">New</th>
                  <th className="pb-3 text-xs font-medium text-slate-400 text-right">Updated</th>
                  <th className="pb-3 text-xs font-medium text-slate-400 text-right">Cancelled</th>
                </tr>
              </thead>
              <tbody>
                {imports.map(imp => {
                  const prop = properties.find(p => p.id === imp.property_id)
                  return (
                    <tr key={imp.id} className="border-b border-slate-700/30 last:border-0">
                      <td className="py-3 text-slate-300">
                        {format(new Date(imp.imported_at), 'MMM d, yyyy')}
                      </td>
                      <td className="py-3 text-slate-300">{prop?.name ?? '—'}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${
                          imp.platform === 'airbnb'
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          {imp.platform}
                        </span>
                      </td>
                      <td className="py-3 text-slate-300 text-right">{imp.rows_imported}</td>
                      <td className="py-3 text-emerald-400 text-right">{imp.new_bookings}</td>
                      <td className="py-3 text-yellow-400 text-right">{imp.updated_bookings}</td>
                      <td className="py-3 text-red-400 text-right">{imp.cancelled_bookings}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
