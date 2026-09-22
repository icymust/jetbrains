import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FolderOpen, TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { FolderPicker } from '@/components/folder-picker'
import { ThemeToggle } from '@/components/theme-toggle'
import { ApiError, createProject, type Project } from '@/lib/api'

type Phase = 'idle' | 'creating'

interface FieldErrors {
  name?: string
  path?: string
}

export default function AddProject() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const busy = phase !== 'idle'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return

    const trimmedName = name.trim()
    const trimmedPath = path.trim()

    const errors: FieldErrors = {}
    if (!trimmedName) errors.name = 'Give the project a name.'
    if (!trimmedPath) errors.path = 'Enter the path to a local Git repository.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setFormError(null)
    setPhase('creating')

    let project: Project
    try {
      project = await createProject(trimmedName, trimmedPath)
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Could not create the project.'
      const field = fieldFor(message)
      if (field) {
        setFieldErrors({ [field]: message })
      } else {
        setFormError(message)
      }
      setPhase('idle')
      return
    }

    // The analysis itself belongs to the loader page, which owns its progress and errors.
    navigate(`/projects/${project.id}/analyzing`, { replace: true })
  }

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          nativeButton={false}
          render={<Link to="/" />}
        >
          <ArrowLeft />
          Back to projects
        </Button>
        <ThemeToggle />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New project</CardTitle>
          <CardDescription>
            CodeOrbit reads a local Git repository and maps its services and features.
          </CardDescription>
        </CardHeader>

        {/* The form sits between Card and its slots, so it repeats the Card's own column gap. */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-(--card-spacing)">
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(fieldErrors.name)}>
                <FieldLabel htmlFor="project-name">Project name</FieldLabel>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="CodeOrbit"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={Boolean(fieldErrors.name)}
                />
                <FieldError>{fieldErrors.name}</FieldError>
              </Field>

              <Field data-invalid={Boolean(fieldErrors.path)}>
                <FieldLabel htmlFor="project-path">Repository path</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="project-path"
                    value={path}
                    onChange={(event) => setPath(event.target.value)}
                    placeholder="/home/you/projects/my-app"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                    disabled={busy}
                    aria-invalid={Boolean(fieldErrors.path)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={busy}
                    onClick={() => setPickerOpen(true)}
                  >
                    <FolderOpen />
                    Browse
                  </Button>
                </div>
                <FieldDescription>
                  An absolute path on this machine. It must be inside a Git working tree —
                  the backend reads it directly, nothing is uploaded.
                </FieldDescription>
                <FieldError>{fieldErrors.path}</FieldError>
              </Field>
            </FieldGroup>

            {formError && (
              <Alert variant="destructive" className="mt-6">
                <TriangleAlert />
                <AlertTitle>Could not add project</AlertTitle>
                <AlertDescription>
                  <p>{formError}</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Spinner />}
              {busy ? 'Creating project…' : 'Add'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <FolderPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        initialPath={path.trim() || undefined}
        onSelect={(selected) => {
          setPath(selected)
          setFieldErrors((current) => ({ ...current, path: undefined }))
        }}
      />
    </main>
  )
}

/** Attributes a backend 400 to the field it is about, so it renders inline. */
function fieldFor(message: string): keyof FieldErrors | null {
  const text = message.toLowerCase()
  if (text.includes('path')) return 'path'
  if (text.includes('name')) return 'name'
  return null
}
