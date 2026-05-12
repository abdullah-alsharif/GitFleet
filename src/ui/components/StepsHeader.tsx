import { Box, Text } from 'ink'
import { theme } from '../../theme.js'

interface StepsHeaderProps {
  steps: string[]
  current: number
  context?: string
}

/** Breadcrumb-style step indicator: Org → Repos → Confirm → Clone → Done. */
export function StepsHeader({ steps, current, context }: StepsHeaderProps) {
  return (
    <Box marginBottom={1} flexDirection="row" flexWrap="wrap" columnGap={1}>
      {steps.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <Box key={step}>
            {i > 0 && <Text color={theme.colors.mutedDim}>→ </Text>}
            <Text
              bold={active}
              color={
                active
                  ? theme.colors.primary
                  : done
                    ? theme.colors.success
                    : theme.colors.mutedDim
              }
            >
              {done ? `${theme.icons.success} ` : ''}
              {step}
            </Text>
          </Box>
        )
      })}
      {context && <Text color={theme.colors.mutedDim}>  {context}</Text>}
    </Box>
  )
}
