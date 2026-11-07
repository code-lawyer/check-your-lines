export type Cable = {
  id: string; name: string; portLabel: string; connector: string;
  evidence: 'emarker' | 'controller' | 'connection' | 'manual'; presence: 'cable' | 'device' | 'manual';
  sourceLabel: string; kind: 'data' | 'power-only' | 'unknown';
  ratingCurrentA: number | null; ratingVoltageV: number | null; operationalVoltageV: number | null;
  maxPowerW: number | null; dataLabel: string | null; currentSpeedLabel: string | null;
  note: string; warnings: string[]; deviceName?: string | null; location?: string | null;
  connectionScope?: 'external' | 'internal' | 'unknown'; hostConnector?: string | null; powerEvidence?: string;
  specReadState?: 'host-unsupported' | 'not-read';
  speedNote?: string; activeCable?: boolean; epr?: boolean; rawVdos?: string[];
  savedAt?: string; demo?: boolean; color?: string;
  inventoryId?: string; originId?: string; updatedAt?: string;
  photoDataUrl?: string; storageLocation?: string; userNote?: string;
  recordedSpecs?: { connector?: string; kind?: 'data' | 'power-only'; maxPowerW?: number; ratingCurrentA?: number; ratingVoltageV?: number; dataLabel?: string; epr?: boolean; sourceNote?: string };
};
export type Snapshot = {
  platform: string; cables: Cable[]; scannedAt: string;
  capabilities: { singleEnded: string; emarker: string; message: string; ucsiPresent?: boolean; warnings?: string[] };
  diagnostics?: {
    needsRestore?: boolean;
    internalDevices: { name: string; location: string | null; reason: string }[];
    unclassifiedDevices: { name: string; location: string | null; reason: string }[];
    duplicateCount: number;
    ucsi?: { state: string; controllers: { name: string; testInterfaceEnabled: boolean }[]; compatibility?: { state: string; reason: string; checkedAt: string } };
  };
};
export type CompatibilityCheck = { cancelled?: boolean; restored?: boolean; restorationOnly?: boolean; error?: string; records?: Cable[]; profile?: { state: string; reason: string; checkedAt?: string; connectors?: number } };
export type CatalogRecoveryInfo = {available:boolean;records?:number;savedAt?:string};
export type CatalogRecoveryRequest = {source:'backup'} | {source:'import';records:Cable[]};
declare global {
  interface Window { cablewise?: {
    platform: string; scan: () => Promise<Snapshot>;
    checkComputer: () => Promise<CompatibilityCheck>; restoreComputer: () => Promise<CompatibilityCheck>;
    exportReport: (payload: string, format?: 'json' | 'html' | 'csv') => Promise<boolean>; openSource: (url: string) => Promise<void>;
    loadCatalog: () => Promise<{ records: Cable[] | null }>; saveCatalog: (records: Cable[]) => Promise<Cable[]>;
    catalogRecoveryInfo: () => Promise<CatalogRecoveryInfo>; recoverCatalog: (request:CatalogRecoveryRequest) => Promise<{records:Cable[];originalPreserved:boolean}>;
  } }
}
