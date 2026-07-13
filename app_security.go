package main

import (
	nexpkg "nex/nex"
)

type svgDesignerSecurityPolicy struct{}

// Allow grants every privileged native API without confirmation.
// SVG Designer is a single-user desktop tool; every operation is directly
// user-initiated (Import button, drag-drop, export) and carries no side-effects
// beyond the user's own filesystem. Zenity dialogs would only add friction.
func (svgDesignerSecurityPolicy) Allow(_ *nexpkg.Context, _ nexpkg.SecurityDecision) error {
	return nil
}
