## Context

Closes #<!-- issue number, or state "No issue" -->

> **Release note:** <!-- One or two plain-language sentences stating the concrete outcome of this change. -->

## Review order

<!-- List key files in the order the reviewer should read them, with a brief note on why. -->
1. `path/to/schema`: <!-- Data model or contract change -->
2. `path/to/logic`: <!-- Core behavior -->
3. `path/to/ui`: <!-- Interface wiring -->

## Visual changes

<!-- Delete this table if the change has no user interface. -->
| Before | After |
| :--- | :--- |
| <!-- image or text --> | <!-- image or text --> |

## Verification

### Automated checks
- [ ] Typecheck passes
- [ ] Tests pass
- [ ] Production build succeeds

### Manual proof
<!-- Describe what you clicked or ran. Paste the command output or test log. -->
1. Step to reproduce or test.
2. Observed result.

## Deploy and rollback notes

- [ ] Schema migrations applied: <!-- State "None" or name the migration file -->
- [ ] Safe to roll back: <!-- Yes, or describe why data migration makes rollback difficult -->
- [ ] No secrets or environment credentials in this diff
