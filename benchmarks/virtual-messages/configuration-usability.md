# Configuration usability probe

Two fresh-context sub-agents independently predicted configuration behavior and
then compared two policies. Neither saw the implementation, the current policy,
prior conversation, or the other agent's answer. The policy order/labels were
reversed for the second participant. This is a small qualitative agent probe,
not a human study or statistical evidence about users.

Both were told the three output structures, that virtual modules require Vite,
and that Vite should default to virtual modules while the CLI defaults to
physical message modules. They first predicted seven scenarios, then compared:

- Explicit invocation/plugin options override project configuration; project
  configuration overrides surface defaults. Validate the effective options.
- Project configuration is canonical; differing explicit invocation/plugin
  values cause an error naming both settings. Defaults only fill absent values.

## Observations

Both participants predicted the same layout behavior for these six scenarios:

| Scenario | Expected result, both participants |
| --- | --- |
| Project message modules; Vite omits layout | Physical message modules |
| Project locale modules; Vite explicitly selects virtual | Virtual modules |
| Project virtual; CLI omits layout | Actionable unsupported-layout error |
| Project virtual; CLI explicitly selects message modules | Physical message modules |
| Neither setting present; Vite | Virtual modules |
| Watched project edit from physical to virtual, no override | Adopt the new layout; invalidate stale output/modules |

Both preferred invocation > project > defaults. They expected a local explicit
option to be a deliberate override and found a conflict error surprising for
valid per-surface operations. The second participant judged conflict errors more
discoverable and better at exposing stale duplicate settings, while still
preferring scoped overrides overall.

The declaration scenario revealed a documentation requirement: the first prompt
did not explicitly state that virtual output requires declarations, and that
participant assumed false could be preserved with virtual output. The second
prompt did state the requirement, and its participant expected an actionable
error. This difference prevents treating that scenario as a controlled A/B
comparison. The public documentation and validation now state the requirement
and explain how to enable declarations or select physical output.

## Applied decisions and executable checks

- Keep a single `outputStructure` setting; remove the experimental boolean.
- Make virtual modules the Vite default only when no explicit layout is supplied.
- Preserve invocation > project > defaults. Show a project-file-first setup and
  an intentional CLI physical override in the documentation.
- Reject unsupported virtual output rather than silently falling back. Fix the
  CLI fallback that previously replaced configured layouts with its default.
- Validate the complete effective configuration, including an explicit false
  declaration flag, before publishing output.
- Exercise every Vite layout override against watched project settings, actual
  SSR imports and physical-file assertions in `virtual-output-structure.test.ts`.
- Exercise CLI absent/configured/explicit-override cases in `command.test.ts`,
  and direct compiler/non-Vite rejection before loading the project.

The six matching predictions motivated the policy; executable regression tests
verify the implementation. The probe does not establish that all developers or
agents will prefer this policy, and no new effective-config command was added.
