/**
 * Icon registry — the ONLY place components get icons from (taxonomy app convention).
 * Each icon is named by ROLE (what it means in the UI), not by shape.
 * Shapes copied from the taxonomy app are maintained here as our own;
 * add, arrow, delete, download, edit, login, file, search and upload-file are nomad-sdk additions (Material Icons, Apache-2.0).
 */
import AddSvg from './add.svg?react';
import ArrowSvg from './arrow.svg?react';
import EditSvg from './edit.svg?react';
import FileSvg from './file.svg?react';
import UploadFileSvg from './upload-file.svg?react';
import CheckSvg from './check.svg?react';
import CopySvg from './copy.svg?react';
import DeleteSvg from './delete.svg?react';
import ChevronDownSvg from './chevron-down.svg?react';
import ChevronLeftSvg from './chevron-left.svg?react';
import ChevronRightSvg from './chevron-right.svg?react';
import CloseSvg from './close.svg?react';
import DownloadSvg from './download.svg?react';
import DropdownSvg from './dropdown.svg?react';
import ExternalLinkSvg from './external-link.svg?react';
import FolderSvg from './folder.svg?react';
import GitHubSvg from './github.svg?react';
import LoginSvg from './login.svg?react';
import LogoutSvg from './logout.svg?react';
import MenuSvg from './menu.svg?react';
import RunSvg from './run.svg?react';
import SearchSvg from './search.svg?react';
import TreeLeafSvg from './tree-leaf.svg?react';
import { createAssetIcon } from './createAssetIcon';

// --- shared with the taxonomy app (same names, same roles) ---------------
export const CheckIcon = createAssetIcon(CheckSvg, 'CheckIcon');
export const CloseIcon = createAssetIcon(CloseSvg, 'CloseIcon');
export const DropdownIcon = createAssetIcon(DropdownSvg, 'DropdownIcon');
export const ExternalLinkIcon = createAssetIcon(ExternalLinkSvg, 'ExternalLinkIcon');
export const FolderIcon = createAssetIcon(FolderSvg, 'FolderIcon');
export const GitHubIcon = createAssetIcon(GitHubSvg, 'GitHubIcon');
export const LogoutIcon = createAssetIcon(LogoutSvg, 'LogoutIcon');
export const MenuIcon = createAssetIcon(MenuSvg, 'MenuIcon');
/** Hide a side pane. */
export const PaneCollapseIcon = createAssetIcon(ChevronRightSvg, 'PaneCollapseIcon');
/** Show a hidden side pane. */
export const PaneExpandIcon = createAssetIcon(ChevronLeftSvg, 'PaneExpandIcon');
/** Tree node: expanded / collapsed. */
export const TreeExpandedIcon = createAssetIcon(ChevronDownSvg, 'TreeExpandedIcon');
export const TreeCollapsedIcon = createAssetIcon(ChevronRightSvg, 'TreeCollapsedIcon');
/** Tree node without children. */
export const TreeLeafIcon = createAssetIcon(TreeLeafSvg, 'TreeLeafIcon');
export const CopyIcon = createAssetIcon(CopySvg, 'CopyIcon');
/** Run (e.g. simulate a workflow). */
export const RunIcon = createAssetIcon(RunSvg, 'RunIcon');

// --- nomad-sdk playground ------------------------------------------------
/** Add an item (e.g. nodes to a workflow). */
export const AddIcon = createAssetIcon(AddSvg, 'AddIcon');
/** Download / export a generated file. */
export const DownloadIcon = createAssetIcon(DownloadSvg, 'DownloadIcon');
/** A file (files panel, workflow nodes). */
export const FileIcon = createAssetIcon(FileSvg, 'FileIcon');
/** Choose local files / folders to open. */
export const OpenFilesIcon = createAssetIcon(UploadFileSvg, 'OpenFilesIcon');
/** Connection handle on a node (rotated per side). */
export const ConnectIcon = createAssetIcon(ArrowSvg, 'ConnectIcon');
/** Rename / edit. */
export const EditIcon = createAssetIcon(EditSvg, 'EditIcon');
/** Remove an item. */
export const DeleteIcon = createAssetIcon(DeleteSvg, 'DeleteIcon');
/** Sign in to NOMAD. */
export const LoginIcon = createAssetIcon(LoginSvg, 'LoginIcon');
/** Filter / search a list. */
export const SearchIcon = createAssetIcon(SearchSvg, 'SearchIcon');
