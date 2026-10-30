import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Trash2Icon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BusinessLogo } from '@/components/business-logo';
import { Field, FieldGrid } from '@/components/field';
import { ImportCard } from '@/components/import-card';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import type { HealthResponse, SystemStats } from '@/lib/api';
import { formatBytes, formatDuration, pluralize } from '@/lib/format';
import { prepareLogo, prepareQr } from '@/lib/logo';
import { useWorkspace } from '@/lib/workspace';

interface SettingsForm {
  name: string;
  email: string;
  address: string;
  phone: string;
  currency: string;
  taxPercent: string;
  payment: '' | 'link' | 'qr';
  paymentLinkUrl: string;
  commitOnSave: boolean;
}

const EMPTY: SettingsForm = {
  name: '',
  email: '',
  address: '',
  phone: '',
  currency: 'USD',
  taxPercent: '0',
  payment: '',
  paymentLinkUrl: '',
  commitOnSave: true,
};

export const Settings = () => {
  const { config, setConfig } = useWorkspace();
  const [form, setForm] = useState<SettingsForm>(EMPTY);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [system, setSystem] = useState<SystemStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrVersion, setQrVersion] = useState(0);
  const [qrFailed, setQrFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const qrInput = useRef<HTMLInputElement>(null);
  /** Set once the user edits a field; stops config broadcasts from wiping typed values. */
  const dirty = useRef(false);

  useEffect(() => {
    if (config === null || dirty.current) return;
    setForm({
      name: config.business.name,
      email: config.business.email,
      address: config.business.address,
      phone: config.business.phone,
      currency: config.business.currency,
      taxPercent: (config.business.tax_rate_bps / 100).toFixed(2),
      payment: config.business.payment,
      paymentLinkUrl: config.business.payment_link_url,
      commitOnSave: config.git.commit_on_save,
    });
  }, [config]);

  useEffect(() => {
    setQrFailed(false);
  }, [qrVersion, config?.business.payment_qr]);

  useEffect(() => {
    void Promise.all([api.health(), api.system()])
      .then(([healthResponse, systemResponse]) => {
        setHealth(healthResponse);
        setSystem(systemResponse.system);
      })
      .catch(() => undefined);
  }, []);

  const update = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]): void => {
    dirty.current = true;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const onLogoChosen = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;

    setLogoBusy(true);
    try {
      const blob = await prepareLogo(file);
      const response = await api.config.uploadLogo(blob);
      setConfig(response.config);
      setLogoVersion((value) => value + 1);
      toast.success('Logo saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the logo');
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async (): Promise<void> => {
    setLogoBusy(true);
    try {
      const response = await api.config.removeLogo();
      setConfig(response.config);
      setLogoVersion((value) => value + 1);
      toast.success('Logo removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the logo');
    } finally {
      setLogoBusy(false);
    }
  };

  const onQrChosen = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;

    setQrBusy(true);
    try {
      const blob = await prepareQr(file);
      const response = await api.config.uploadQr(blob);
      setConfig(response.config);
      setQrVersion((value) => value + 1);
      update('payment', 'qr');
      toast.success('Payment QR saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the QR image');
    } finally {
      setQrBusy(false);
    }
  };

  const removeQr = async (): Promise<void> => {
    setQrBusy(true);
    try {
      const response = await api.config.removeQr();
      setConfig(response.config);
      setQrVersion((value) => value + 1);
      update('payment', '');
      toast.success('Payment QR removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the QR image');
    } finally {
      setQrBusy(false);
    }
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
    const paymentLinkUrl = form.paymentLinkUrl.trim();
    if (form.payment === 'link') {
      if (paymentLinkUrl === '') {
        toast.error('Add a payment link, or switch payment info off');
        return;
      }
      if (!/^https?:\/\//i.test(paymentLinkUrl)) {
        toast.error('Payment link must start with http:// or https://');
        return;
      }
    }
    if (form.payment === 'qr' && (config?.business.payment_qr ?? '') === '') {
      toast.error('Upload a QR image first, or switch payment info off');
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
          payment: form.payment,
          payment_link_url: paymentLinkUrl,
        },
        git: { commit_on_save: form.commitOnSave },
      });
      dirty.current = false;
      setConfig(response.config);
      toast.success('Settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const uptimeLabel = system === null ? '…' : formatDuration(system.uptimeSeconds);
  const memoryLabel =
    system === null
      ? '…'
      : `${formatBytes(system.memory.rssBytes)} RSS · ${formatBytes(
          system.memory.heapUsedBytes,
        )} / ${formatBytes(system.memory.heapTotalBytes)} heap`;
  const systemMemoryLabel =
    system === null
      ? '…'
      : `${formatBytes(system.memory.freeBytes)} free of ${formatBytes(system.memory.totalBytes)}`;
  const cpuLabel =
    system === null
      ? '…'
      : `${pluralize(system.cpu.cores, 'core')} · load ${system.cpu.load1.toFixed(
          2,
        )} / ${system.cpu.load5.toFixed(2)} / ${system.cpu.load15.toFixed(2)}`;
  const diskLabel =
    system === null
      ? '…'
      : system.disk === null
        ? 'Unavailable'
        : `${formatBytes(system.disk.availableBytes)} free of ${formatBytes(
            system.disk.totalBytes,
          )}`;
  const runtimeLabel = system === null ? '…' : `${system.node} · ${system.platform}`;
  const paymentMode = form.payment === '' ? 'off' : form.payment;
  const hasQr = (config?.business.payment_qr ?? '') !== '';

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
          <div className="flex flex-wrap items-center gap-4">
            <BusinessLogo
              name={form.name}
              logo={config?.business.logo ?? ''}
              version={logoVersion}
              className="size-16 rounded-md border bg-muted/30 p-1"
            />
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={logoBusy}
                  onClick={() => fileInput.current?.click()}
                >
                  {logoBusy ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <UploadIcon data-icon="inline-start" />
                  )}
                  {config?.business.logo === undefined || config.business.logo === ''
                    ? 'Upload logo'
                    : 'Replace logo'}
                </Button>
                {config?.business.logo === undefined || config.business.logo === '' ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={logoBusy}
                    onClick={() => void removeLogo()}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="max-w-md text-xs text-muted-foreground">
                Any image is resized to 768 px and re-encoded as PNG in your browser (EXIF
                stripped). Stored in .ob/assets/logo.png and committed with the workspace.
              </p>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void onLogoChosen(event)}
            />
          </div>

          <Separator />

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
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
              />
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
          <CardTitle>Payment</CardTitle>
          <CardDescription>
            Printed at the bottom of invoices, estimates and documents so clients know how to pay.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">How clients pay</span>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={paymentMode}
              aria-label="How clients pay"
              onValueChange={(value) => {
                if (value === '') return;
                update('payment', value === 'off' ? '' : (value as 'link' | 'qr'));
              }}
            >
              <ToggleGroupItem value="off">No payment info</ToggleGroupItem>
              <ToggleGroupItem value="link">Payment link</ToggleGroupItem>
              <ToggleGroupItem value="qr">QR code</ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              Only the selected mode is printed. You can keep both a link and a QR on file.
            </p>
          </div>

          {form.payment === 'link' ? (
            <Field
              label="Payment link"
              htmlFor="payment-link"
              hint="Full URL, starting with http:// or https://."
            >
              <Input
                id="payment-link"
                type="url"
                placeholder="https://…"
                value={form.paymentLinkUrl}
                onChange={(e) => update('paymentLinkUrl', e.target.value)}
              />
            </Field>
          ) : null}

          {form.payment === 'qr' ? (
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white p-2">
                {hasQr && !qrFailed ? (
                  <img
                    src={`/api/qr?v=${qrVersion}`}
                    alt="Payment QR code"
                    className="size-full object-contain"
                    onError={() => setQrFailed(true)}
                  />
                ) : (
                  <span className="text-center text-xs text-muted-foreground">No QR yet</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={qrBusy}
                    onClick={() => qrInput.current?.click()}
                  >
                    {qrBusy ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <UploadIcon data-icon="inline-start" />
                    )}
                    {hasQr ? 'Replace QR' : 'Upload QR'}
                  </Button>
                  {hasQr ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={qrBusy}
                      onClick={() => void removeQr()}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Remove
                    </Button>
                  ) : null}
                </div>
                <p className="max-w-md text-xs text-muted-foreground">
                  Re-encoded as JPEG with a white background and stored at .ob/assets/qr.jpg. A new
                  upload replaces the old file.
                </p>
                {form.paymentLinkUrl.trim() === '' ? null : (
                  <p className="max-w-md text-xs text-muted-foreground">
                    Your payment link prints under the QR as a fallback.
                  </p>
                )}
              </div>
              <input
                ref={qrInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void onQrChosen(event)}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Git</CardTitle>
          <CardDescription>
            Commit-on-save keeps the working tree clean. Pushing is always manual.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-1">
            <Label htmlFor="commit-on-save">Commit on save</Label>
            <p className="text-xs text-muted-foreground">
              Commits only the record you saved, once per burst of edits. Turn this off to keep
              changes uncommitted until you sync.
            </p>
          </div>
          <Switch
            id="commit-on-save"
            checked={form.commitOnSave}
            onCheckedChange={(checked) => update('commitOnSave', checked)}
          />
        </CardContent>
      </Card>

      <ImportCard />

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            Read-only details about the folder this server is running on.
          </CardDescription>
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
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Uptime</span>
            <span className="tabular">{uptimeLabel}</span>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Process memory</span>
            <span className="tabular text-xs">{memoryLabel}</span>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">System memory</span>
            <span className="tabular text-xs">{systemMemoryLabel}</span>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">CPU</span>
            <span className="tabular text-xs">{cpuLabel}</span>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Workspace disk</span>
            <span className="tabular text-xs">{diskLabel}</span>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Runtime</span>
            <span className="font-mono text-xs">{runtimeLabel}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
