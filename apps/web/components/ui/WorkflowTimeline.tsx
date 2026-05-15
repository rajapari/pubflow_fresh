import { formatDistanceToNow } from 'date-fns'

interface WorkflowStep {
  fromStatus?: string
  toStatus: string
  performedBy?: string
  note?: string
  createdAt: string
}

export function WorkflowTimeline({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900">Workflow History</h3>
      <div className="relative pl-4 space-y-4">
        {steps.map((step, idx) => (
          <div key={idx} className="flex">
            <div className="absolute -left-3 mt-1.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white" />
            <div className="ml-6 pb-4 border-l border-gray-200 last:border-l-0">
              <div className="text-sm font-medium text-gray-900">
                {step.fromStatus && <span className="text-gray-500">{step.fromStatus} → </span>}
                <span className="text-blue-600">{step.toStatus}</span>
              </div>
              {step.note && <p className="text-sm text-gray-600 mt-1">{step.note}</p>}
              {step.performedBy && <p className="text-xs text-gray-500 mt-1">by {step.performedBy}</p>}
              <time className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(step.createdAt), { addSuffix: true })}
              </time>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
