import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AlertCircleIcon, DownloadIcon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  IMPORT_DEFINITIONS,
  IMPORT_TYPES,
  MAX_IMPORT_ROWS,
  isImportType,
  type ImportType,
} from '../../import/definitions.js';
import { api } from '@/lib/api';
import type { ImportReport } from '@/lib/api';
import { useWorkspace } from '@/lib/workspace';

/**
 * Settings → Import. The file is read in the browser and posted as text; the
 * server reports per-row failures with spreadsheet line numbers so the user
 * can fix the file and re-import the skipped rows (docs/14).
 */
export const ImportCard = () => {
  const { refresh } = useWorkspace();
  const [type, setType] = useState<ImportType>('contact');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const definition = IMPORT_DEFINITIONS[type];

  const chooseType = (value: string): void => {
    if (!isImportType(value)) return;
    setType(value);
    setReport(null);
  };

  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;

    setBusy(true);
    setReport(null);
    try {
      const result = await api.import.run(type, await file.text());
      setReport(result);
      await refresh();

      if (result.failed.length === 0) {
        toast.success(`Imported ${result.created} ${definition.plural}`);
      } else if (result.created === 0) {
        toast.error('No rows were imported. See the skipped rows below.');
      } else {
        toast.warning(`Imported ${result.created} of ${result.rows} rows`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import the file');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import</CardTitle>
        <CardDescription>
          Add contacts, projects or tasks from a CSV file. Estimates and invoices are edited in the
          app.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-48 flex-col gap-1.5">
            <Label htmlFor="import-type">Record type</Label>
            <Select value={type} onValueChange={chooseType}>
              <SelectTrigger id="import-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {IMPORT_TYPES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {IMPORT_DEFINITIONS[key].label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <Button asChild variant="outline" size="sm">
            <a href={api.import.skeletonUrl(type)} download>
              <DownloadIcon data-icon="inline-start" />
              Download skeleton
            </a>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
            Import CSV
          </Button>

          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => void onFileChosen(event)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Columns:{' '}
          <span className="font-mono">
            {definition.columns.map((column) => column.header).join(', ')}
          </span>
          . Header names are case-insensitive. Up to {MAX_IMPORT_ROWS} rows per file; invalid rows
          are skipped and reported with their line number.
        </p>

        {report === null ? null : (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              {report.created === 0
                ? 'No rows imported'
                : `Imported ${report.created} of ${report.rows} row${report.rows === 1 ? '' : 's'}`}
              {report.failed.length === 0 ? '.' : ` — ${report.failed.length} skipped.`}
            </p>

            {report.failed.length === 0 ? null : (
              <Alert>
                <AlertCircleIcon />
                <AlertTitle>Skipped rows</AlertTitle>
                <AlertDescription>
                  <ul className="flex flex-col gap-1">
                    {report.failed.map((failure) => (
                      <li key={`${failure.line}-${failure.message}`} className="font-mono text-xs">
                        Line {failure.line}: {failure.message}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
