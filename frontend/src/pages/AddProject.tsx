import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

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
import { ApiError, createProject, loadProject, type Project } from '@/lib/api'

type Phase = 'idle' | 'creating' | 'analyzing'

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
  /** Set when creation succeeded but analysis did not — the project exists on the server. */
  const [unanalyzed, setUnanalyzed] = useState<Project | null>(null)

  const busy = phase !== 'idle'

  async function analyze(project: Project) {
    setPhase('analyzing')
    setFormError(null)
    try {
      await loadProject(project.id)
      toast.success(`Mapped ${project.name}`)
      navigate(`/projects/${project.id}/graph`, { replace: true })
    } catch (error) {
      setUnanalyzed(project)
      setFormError(
        error instanceof ApiError ? error.message : 'The analysis failed unexpectedly.',
      )
      setPhase('idle')
    }
  }

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
    setUnanalyzed(null)
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

    await analyze(project)
  }

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-12">
      <Button
        variant="ghost"
        size="sm"
        className="mb-6 -ml-2"
        nativeButton={false}
        render={<Link to="/" />}
      >
        <ArrowLeft />
        Back to projects
      </Button>

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
                <AlertTitle>
                  {unanalyzed ? 'Project saved, but the analysis failed' : 'Could not add project'}
                </AlertTitle>
                <AlertDescription>
                  <p>{formError}</p>
                  {unanalyzed && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void analyze(unanalyzed)}
                      >
                        Retry analysis
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="no-underline"
                        nativeButton={false}
                        render={<Link to={`/projects/${unanalyzed.id}/graph`} />}
                      >
                        Open anyway
                      </Button>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex-col items-stretch gap-2">
            <Button type="submit" disabled={busy}>
              {busy && <Spinner />}
              {phase === 'creating'
                ? 'Creating project…'
                : phase === 'analyzing'
                  ? 'Analyzing repository…'
                  : 'Add project'}
            </Button>
            {phase === 'analyzing' && (
              <p className="text-center text-xs text-muted-foreground">
                The first analysis calls an AI model and can take a while.
              </p>
            )}
          </CardFooter>
        </form>
      </Card>
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
