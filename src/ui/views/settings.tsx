import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Field, FieldGrid } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import type { HealthResponse } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

interface SettingsForm {
  name: string;
  email: string;
  address: string;
  phone: string;
  currency: string;
  taxPercent: string;
}

const EMPTY: SettingsForm = {
  name: '',
  email: '',
  address: '',
  phone: '',
  currency: 'USD',
  taxPercent: '0',
};

export const Settings = () => {
  const { config, setConfig } = useWorkspace();
  const [form, setForm] = useState<SettingsForm>(EMPTY);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config === null) return;
    setForm({
      name: config.business.name,
      email: config.business.email,
      address: config.business.address,
      phone: config.business.phone,
      currency: config.business.currency,
      taxPercent: (config.business.tax_rate_bps / 100).toFixed(2),
    });
  }, [config]);

  useEffect(() => {
    void api
      .health()
      .then(setHealth)
      .catch(() => undefined);
  }, []);

  const update = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async (): Promise<void> => {
    const percent = Number(form.taxPercent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      toast.error('Tax rate must be between 0 and 100');
      return;
    }
    if (!/^[A-Za-z]{3}$/.test(form.currency)) {
      toast.error('Currency must be a 3-letter code, e.g. USD');
      return;
    }

    setSaving(true);
    try {
      const response = await api.config.patch({
        business: {
          name: form.name,
          email: form.email,
          address: form.address,
          phone: form.phone,
          currency: form.currency.toUpperCase(),
          tax_rate_bps: Math.round(percent * 100),
        },
      });
      setConfig(response.config);
      toast.success('Settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Business defaults live in .ob/config.json, which is committed with your workspace."
        actions={
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Business</CardTitle>
          <CardDescription>Appears on estimates, invoices and printed documents.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <FieldGrid>
            <Field label="Business name" htmlFor="name">
              <Input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
            </Field>
            <Field label="Currency" htmlFor="currency" hint="ISO 4217, e.g. USD, EUR, GBP.">
              <Input
                id="currency"
                value={form.currency}
                maxLength={3}
                onChange={(e) => update('currency', e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
            </Field>
          </FieldGrid>

          <Field label="Address" htmlFor="address">
            <Input
              id="address"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
            />
          </Field>

          <Field
            label="Tax rate"
            htmlFor="taxPercent"
            hint="Stored as integer basis points; 8.50% is 850 bps. Rounded once, at the tax step."
          >
            <Input
              id="taxPercent"
              inputMode="decimal"
              value={form.taxPercent}
              onChange={(e) => update('taxPercent', e.target.value)}
              className="tabular max-w-32"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Read-only details about the folder this server is running on.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Path</span>
            <span className="font-mono text-xs">{health?.workspace ?? '…'}</span>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Records indexed</span>
            <span className="tabular">{health?.records ?? '…'}</span>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Server version</span>
            <span className="font-mono text-xs">{health?.version ?? '…'}</span>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Config file</span>
            <span className="font-mono text-xs">.ob/config.json</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
