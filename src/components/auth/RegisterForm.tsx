'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiFetch, ApiError } from '@/lib/api-client';

const VEHICLE_LABELS: Record<string, string> = {
  MOTORCYCLE: 'Moto',
  CAR: 'Voiture',
  VAN: 'Utilitaire',
  BICYCLE: 'Vélo',
  TRUCK: 'Camion',
};

interface ZoneOption {
  id: string;
  name: string;
  city: string;
}

export function RegisterForm({ role, defaultReferralCode }: { role: 'SUPPLIER' | 'DRIVER'; defaultReferralCode?: string }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [vehicleType, setVehicleType] = useState('MOTORCYCLE');
  const [address, setAddress] = useState('');
  const [referralCode, setReferralCode] = useState(defaultReferralCode ?? '');
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [zonesError, setZonesError] = useState(false);
  const [city, setCity] = useState('');
  const [baseZoneId, setBaseZoneId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (role !== 'DRIVER') return;
    apiFetch<ZoneOption[]>('/api/v1/zones')
      .then(setZones)
      .catch(() => setZonesError(true));
  }, [role]);

  // Sélection en deux temps ville → zone : une ville avec une seule zone
  // s'auto-sélectionne (cas courant aujourd'hui), une ville découpée en
  // plusieurs zones affiche un second choix — sans ce détour, un livreur ne
  // saurait pas laquelle choisir parmi des noms de zone peu explicites.
  const cities = Array.from(new Set(zones.map((z) => z.city))).sort();
  const zonesInCity = zones.filter((z) => z.city === city);

  function handleCityChange(nextCity: string) {
    setCity(nextCity);
    const inCity = zones.filter((z) => z.city === nextCity);
    setBaseZoneId(inCity.length === 1 ? inCity[0]!.id : '');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (role === 'DRIVER' && !baseZoneId) {
      setError('Sélectionnez votre ville (et votre zone si demandée).');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          email: email || undefined,
          password,
          role,
          ...(role === 'SUPPLIER'
            ? { companyName }
            : { vehicleType, address, baseZoneId: baseZoneId || undefined, referralCode: referralCode.trim() || undefined }),
        }),
      });
      router.push('/login?registered=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'inscription.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-hairline bg-surface p-6">
      <div className="grid grid-cols-2 gap-3">
        <Field id="firstName" label="Prénom">
          <input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
        </Field>
        <Field id="lastName" label="Nom">
          <input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field id="phone" label="Téléphone">
        <input id="phone" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+212600000000" className={inputClass} />
      </Field>

      <Field id="email" label="Email (optionnel)">
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </Field>

      {role === 'SUPPLIER' ? (
        <Field id="companyName" label="Raison sociale">
          <input id="companyName" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Nom de votre entreprise" className={inputClass} />
        </Field>
      ) : (
        <>
          <Field id="vehicleType" label="Type de véhicule">
            <select id="vehicleType" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputClass}>
              {Object.entries(VEHICLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="address" label="Adresse">
            <input
              id="address"
              required
              minLength={5}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rue, quartier, ville"
              className={inputClass}
            />
          </Field>

          {zonesError && (
            <p className="text-xs text-status-critical">
              Impossible de charger la liste des villes — rechargez la page pour réessayer.
            </p>
          )}

          {cities.length > 0 && (
            <>
              <Field id="city" label="Ville">
                <select
                  id="city"
                  required
                  value={city}
                  onChange={(e) => handleCityChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>
                    Sélectionnez votre ville
                  </option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              {city && zonesInCity.length > 1 && (
                <Field id="baseZoneId" label="Zone">
                  <select
                    id="baseZoneId"
                    required
                    value={baseZoneId}
                    onChange={(e) => setBaseZoneId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Sélectionnez votre zone
                    </option>
                    {zonesInCity.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <p className="text-xs text-ink-muted">
                Détermine où vous recevrez des missions dès l&apos;approbation de votre compte — modifiable ensuite.
              </p>
            </>
          )}

          <Field id="referralCode" label="Code de parrainage (optionnel)">
            <input
              id="referralCode"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              placeholder="Ex: AB3XQ9K"
              className={`${inputClass} uppercase tracking-widest`}
            />
          </Field>
        </>
      )}

      <Field id="password" label="Mot de passe">
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-ink-muted">10 caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.</p>
      </Field>

      {error && (
        <p role="alert" className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}

      <Button type="submit" loading={loading} className="w-full">
        Créer mon compte
      </Button>

      <p className="text-center text-xs text-ink-muted">
        Votre compte devra être validé par un opérateur LogiFlow avant de pouvoir {role === 'SUPPLIER' ? 'créer des commandes' : 'recevoir des missions'}.
      </p>
    </form>
  );
}

const inputClass =
  'mt-1 w-full rounded-md border border-hairline px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-primary">
        {label}
      </label>
      {children}
    </div>
  );
}
