/**
 * src/ui/react/App.tsx
 *
 * Root of the React UI layer. Renders every surface in a FIXED order inside
 * a fragment — each surface is a stub (returns null) until its agent
 * implements it, so mounting App is safe at any migration stage.
 *
 * Order is part of the contract (later = visually on top for overlays):
 * keep ToastStack first and MenuScreens last; do not reorder when
 * implementing a surface.
 */

import ToastStack from './surfaces/ToastStack.tsx';
import GameLog from './surfaces/GameLog.tsx';
import PlayerPanel from './surfaces/PlayerPanel.tsx';
import ActionModal from './surfaces/ActionModal.tsx';
import BuildPanels from './surfaces/BuildPanels.tsx';
import SettingsPanel from './surfaces/SettingsPanel.tsx';
import TradeModal from './surfaces/TradeModal.tsx';
import MenuScreens from './surfaces/MenuScreens.tsx';

export default function App() {
    return (
        <>
            <ToastStack />
            <GameLog />
            <PlayerPanel />
            <ActionModal />
            <BuildPanels />
            <SettingsPanel />
            <TradeModal />
            <MenuScreens />
        </>
    );
}
