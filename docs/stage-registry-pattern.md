# Stage registry pattern (Smart Target frontend)

How to render a different component per workflow step without the page growing into one large file. Not part of CollabDocs; kept here as a reference.

## Idea

- **Config (JSON)** says what stages exist: id, order, title, owner role, kind. Data only, no components.
- **Registry** says how each stage is rendered: it maps a stage id (or kind) to a lazily imported component. It is the only file that knows about stage components.
- **Stage folder** holds each stage's own UI, hooks and validation.
- **Page** is thin. It reads the stage from the URL, asks the registry for its component and renders it. It never imports an individual stage.

Adding a stage means one JSON entry (plus one registry line if it needs custom UI). The page and the stepper do not change.

## Folder structure

```
src/features/smart-target/
├─ config/            stages.brazil.json, stages.schema.ts   (Zod-validated at load)
├─ shell/             SmartTargetPage, WorkflowStepper, StageHeader, PermissionBanner
├─ stages/
│  ├─ registry.ts
│  ├─ types.ts
│  ├─ generic/        UploadStage, ReviewStage, AutomaticStage (by kind)
│  ├─ ibp-output/     IbpOutputStage.tsx, useIbpOutput.ts, validators.ts
│  └─ ...             one folder per custom stage
├─ components/        shared: FileUploadCard, CycleParametersCard, StatusBadge
├─ state/             workflow store (stage statuses), role context
└─ api/               typed API calls
```

Rule: a stage may import from `components/` and `state/`, never from another stage.

## Config

One file per country (or fetch from the API later), so countries can differ without `if (country === ...)` in the UI.

```json
// config/stages.brazil.json
{
  "country": "BR",
  "stages": [
    { "id": "ibp-output", "order": 1, "title": "IBP Output (Kinaxis)",
      "owner": "SALES_INTELLIGENCE", "kind": "upload",
      "description": "Ingest the quarterly volume plan from Kinaxis." },
    { "id": "pl-conversion", "order": 2, "title": "P&L Conversion",
      "owner": "AUTOMATIC", "kind": "automatic" },
    { "id": "trade-investment", "order": 4, "title": "Trade Investment",
      "owner": "TRADE_CHANNEL", "kind": "review" }
  ]
}
```

## Types

```ts
// stages/types.ts
export interface StageConfig {
  id: string
  order: number
  title: string
  owner: string
  kind: 'upload' | 'review' | 'automatic'
}

export interface StageProps {
  stage: StageConfig
  readOnly: boolean
}
```

## Registry

```ts
// stages/registry.ts
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { StageConfig, StageProps } from './types'

type StageComponent = LazyExoticComponent<ComponentType<StageProps>>

// Specific stages: one entry per stage with its own UI.
const byId: Record<string, StageComponent> = {
  'ibp-output': lazy(() => import('./ibp-output/IbpOutputStage')),
  'volume-calibration': lazy(() => import('./volume-calibration/VolumeCalibrationStage')),
}

// Generic fallbacks: stages with no custom UI render by `kind`.
const byKind: Record<StageConfig['kind'], StageComponent> = {
  upload: lazy(() => import('./generic/UploadStage')),
  review: lazy(() => import('./generic/ReviewStage')),
  automatic: lazy(() => import('./generic/AutomaticStage')),
}

export function resolveStageComponent(stage: StageConfig): StageComponent {
  return byId[stage.id] ?? byKind[stage.kind]
}
```

- The id lookup runs first, so a stage can override the generic UI later without touching the page.
- Each `import()` is split into its own chunk and loads only when that stage renders.
- Every lazy stage must use `export default`.

## Page

```tsx
// shell/SmartTargetPage.tsx
import { Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import stagesBrazil from '../config/stages.brazil.json'
import { resolveStageComponent } from '../stages/registry'
import type { StageConfig } from '../stages/types'
import { WorkflowStepper } from './WorkflowStepper'

const stages = stagesBrazil.stages as StageConfig[]

export function SmartTargetPage() {
  const { stageId } = useParams()                     // route: /smart-target/:stageId
  const stage = stages.find((s) => s.id === stageId)

  if (!stage) return <Navigate to={`/smart-target/${stages[0].id}`} replace />

  const Stage = resolveStageComponent(stage)          // chosen from the config
  const readOnly = !canEdit(stage)                    // from role + stage.owner

  return (
    <>
      <WorkflowStepper stages={stages} currentId={stage.id} />
      <h1>{stage.title}</h1>
      <Suspense fallback={<p>Loading stage…</p>}>
        <Stage stage={stage} readOnly={readOnly} />
      </Suspense>
    </>
  )
}
```

Using the URL as the current stage gives deep links, back button and refresh for free.

## A stage component

```tsx
// stages/ibp-output/IbpOutputStage.tsx
import type { StageProps } from '../types'

export default function IbpOutputStage({ stage, readOnly }: StageProps) {
  return (
    <section>
      <p>Stage {stage.order}: upload the IBP file.</p>
      <input type="file" disabled={readOnly} />
    </section>
  )
}
```

## Adding a new stage

1. Add an entry to the JSON, e.g. `{ "id": "ar-disclosure", "order": 7, "kind": "review", ... }`. It renders with the generic `ReviewStage`.
2. If it needs custom UI, create `stages/ar-disclosure/ArDisclosureStage.tsx` and add one line to `byId`.

## Keeping it maintainable

- **Derive permissions** from the stage `owner` plus the current role in one function (edit, view or none); the "View only" banner comes from the same function.
- **One store for stage status** (pending, active, done). Stages report "done"; the shell decides what unlocks next.
- **Validate the config at load** with Zod so a JSON typo fails immediately with a clear error.
- **Keep logic out of JSX.** Put fetching and validation in a hook next to the stage.
- **Share what repeats.** The upload cards are one `FileUploadCard` configured by props (expected file name, required columns, validator).
- **Test the registry:** every configured stage must resolve to a component.

```ts
// stages/registry.test.ts
import { expect, it } from 'vitest'
import stagesBrazil from '../config/stages.brazil.json'
import { resolveStageComponent } from './registry'

it('every configured stage resolves to a component', () => {
  for (const stage of stagesBrazil.stages) {
    expect(resolveStageComponent(stage as never)).toBeDefined()
  }
})
```
