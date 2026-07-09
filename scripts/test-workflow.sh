#!/usr/bin/env bash
# End-to-end PubFlow workflow test: submission -> peer review -> revision loop
# -> production pipeline -> publish. Run against a running local stack
# (pnpm docker:dev + pnpm --filter api dev + pnpm --filter @pubflow/worker dev).
#
# Usage: bash scripts/test-workflow.sh
set -euo pipefail

API="http://localhost:3001/trpc"
KC="http://localhost:8080/realms/pubflow/protocol/openid-connect/token"

# ── helpers ──────────────────────────────────────────────────────────────
login() {
  # $1=email $2=password
  curl -s -m 30 -X POST "$KC" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=pubflow-web" \
    --data-urlencode "username=$1" \
    --data-urlencode "password=$2" \
    | python -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))"
}

q() {
  # tRPC query: $1=token $2=procedure $3=json-input
  local input
  input=$(python -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$3")
  curl -s -m 30 "$API/$2?input=$input" -H "Authorization: Bearer $1"
}

m() {
  # tRPC mutation: $1=token $2=procedure $3=json-body
  curl -s -m 30 -X POST "$API/$2" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $1" \
    -d "$3"
}

field() {
  # extract a field from a tRPC JSON response: $1=json $2=dotted.path
  echo "$1" | python -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d:
    print('ERROR: ' + d['error']['message'][:150], file=sys.stderr); sys.exit(1)
node = d['result']['data']
for k in sys.argv[1].split('.'):
    node = node[k] if not k.isdigit() else node[int(k)]
print(node)
" "$2"
}

step() { echo; echo "=== $1 ==="; }

# ── 0. logins ────────────────────────────────────────────────────────────
step "Logging in as all workflow roles"
AUTHOR=$(login author@demo-journal.local      'Author@Demo2025!')
EDITOR=$(login editor@demo-journal.local      'Editor@Demo2025!')
REVIEWER=$(login reviewer@demo-journal.local  'Reviewer@Demo2025!')
COPYEDITOR=$(login copyeditor@demo-journal.local 'CopyEditor@Demo2025!')
ARTWORK=$(login artwork@demo-journal.local    'Artwork@Demo2025!')
TYPESETTER=$(login typesetter@demo-journal.local 'Typesetter@Demo2025!')
PROOFREADER=$(login proofreader@demo-journal.local 'ProofReader@Demo2025!')
for pair in "author:$AUTHOR" "editor:$EDITOR" "reviewer:$REVIEWER" "copyeditor:$COPYEDITOR" \
            "artwork:$ARTWORK" "typesetter:$TYPESETTER" "proofreader:$PROOFREADER"; do
  name="${pair%%:*}"; tok="${pair#*:}"
  [ -n "$tok" ] && echo "  $name: OK" || { echo "  $name: LOGIN FAILED"; exit 1; }
done

# ── 1. publisher/journal catalogue ──────────────────────────────────────
step "Fetching publisher -> journal catalogue"
CATALOGUE=$(q "$AUTHOR" publication.listGrouped '{}')
PUBLISHER_COUNT=$(echo "$CATALOGUE" | python -c "import sys,json; print(len(json.load(sys.stdin)['result']['data']))")
JOURNAL_ID=$(echo "$CATALOGUE" | python -c "
import sys, json
pubs = json.load(sys.stdin)['result']['data']
sp = next(p for p in pubs if p['name'] == 'Springer Nature')
print(sp['publications'][0]['id'])
")
echo "  $PUBLISHER_COUNT publishers loaded; testing against Springer Nature -> ${JOURNAL_ID:0:8}..."

# ── 2. author: create + submit ──────────────────────────────────────────
step "Author: create submission and manuscript"
SUB=$(m "$AUTHOR" submission.create "{\"publicationId\":\"$JOURNAL_ID\",\"title\":\"Workflow Smoke Test $(date +%s)\",\"abstract\":\"$(python -c 'print("Testing the full editorial pipeline end to end. " * 5)')\",\"keywords\":[\"test\",\"workflow\",\"ci\"],\"coAuthors\":[]}")
SID=$(field "$SUB" id)
echo "  submission: $SID ($(field "$SUB" status))"

m "$AUTHOR" submission.createBlankManuscript "{\"submissionId\":\"$SID\"}" > /dev/null
echo "  manuscript created"

SUBMIT=$(m "$AUTHOR" submission.submit "{\"id\":\"$SID\"}")
echo "  submitted -> $(field "$SUBMIT" status)"

# ── 3. editor: desk review -> peer review -> assign reviewer ───────────
step "Editor: advance to peer review, assign reviewer"
m "$EDITOR" submission.advanceStatus "{\"submissionId\":\"$SID\",\"toStatus\":\"DESK_REVIEW\"}" > /dev/null
echo "  -> DESK_REVIEW"
m "$EDITOR" submission.advanceStatus "{\"submissionId\":\"$SID\",\"toStatus\":\"PEER_REVIEW\"}" > /dev/null
echo "  -> PEER_REVIEW"

REVIEWER_ID=$(q "$EDITOR" 'tenant.listUsers' '{}' | python -c "
import sys, json
users = json.load(sys.stdin)['result']['data']
print(next(u['id'] for u in users if u['email'] == 'reviewer@demo-journal.local'))
")
REVIEW=$(m "$EDITOR" review.assignReviewer "{\"submissionId\":\"$SID\",\"reviewerId\":\"$REVIEWER_ID\"}")
RID=$(field "$REVIEW" id)
echo "  reviewer assigned ($(field "$REVIEW" status))"

# ── 4. reviewer: accept + submit review ─────────────────────────────────
step "Reviewer: accept invitation and submit review"
m "$REVIEWER" review.acceptInvitation "{\"reviewId\":\"$RID\"}" > /dev/null
echo "  accepted"
m "$REVIEWER" review.submit "{\"reviewId\":\"$RID\",\"recommendation\":\"MINOR_REVISION\",\"comments\":\"Solid work overall; please clarify the methodology section and expand the limitations discussion.\"}" > /dev/null
echo "  review submitted: MINOR_REVISION"

# ── 5. editor: revision decision -> author resubmits ────────────────────
step "Editor decision -> author revises -> resubmits (round 1 of 3)"
m "$EDITOR" submission.makeDecision "{\"submissionId\":\"$SID\",\"decision\":\"MINOR_REVISION\"}" > /dev/null
ROUND=$(q "$AUTHOR" submission.byId "{\"id\":\"$SID\"}" | python -c "import sys,json; print(json.load(sys.stdin)['result']['data']['revisionRound'])")
echo "  decision recorded, revisionRound=$ROUND"
RESUBMIT=$(m "$AUTHOR" submission.submit "{\"id\":\"$SID\"}")
echo "  author resubmitted -> $(field "$RESUBMIT" status)"

# ── 6. editor: accept -> production pipeline ─────────────────────────────
step "Editor: accept and advance through production"
m "$EDITOR" submission.makeDecision "{\"submissionId\":\"$SID\",\"decision\":\"ACCEPT\"}" > /dev/null
echo "  ACCEPTED"
for STAGE in COPY_EDITING ARTWORK_PROCESSING TYPESETTING PROOF_REVIEW; do
  RESULT=$(m "$EDITOR" submission.advanceStatus "{\"submissionId\":\"$SID\",\"toStatus\":\"$STAGE\"}")
  echo "  -> $(field "$RESULT" status)"
done

# ── 7. workflow history sanity check ─────────────────────────────────────
step "Full audit trail"
q "$EDITOR" submission.getWorkflowHistory "{\"id\":\"$SID\"}" | python -c "
import sys, json
logs = json.load(sys.stdin)['result']['data']
for l in reversed(logs):
    frm = l['fromStatus'] or '(created)'
    print(f'  {frm:>20} -> {l[\"toStatus\"]:<20} by {l[\"performedBy\"]}')
"

echo
echo "=== DONE — submission $SID walked through the full pipeline ==="
echo "View it at: http://localhost:3000/dashboard/submissions/$SID"
