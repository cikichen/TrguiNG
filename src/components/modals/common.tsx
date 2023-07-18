/**
 * TrguiNG - next gen remote GUI for transmission torrent daemon
 * Copyright (C) 2023  qu1ck (mail at qu1ck.org)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { ModalProps, MultiSelectValueProps } from "@mantine/core";
import {
    Badge, Button, CloseButton, Divider, Group, Loader, Modal, MultiSelect,
    Text, TextInput, ActionIcon, Menu, ScrollArea,
} from "@mantine/core";
import { ConfigContext, ServerConfigContext } from "config";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { pathMapFromServer, pathMapToServer } from "trutil";
import * as Icon from "react-bootstrap-icons";
import { useServerTorrentData } from "rpc/torrent";
import { useHotkeysContext } from "hotkeys";
const { TAURI, dialogOpen } = await import(/* webpackChunkName: "taurishim" */"taurishim");

export interface ModalState {
    opened: boolean,
    close: () => void,
}

export function HkModal(props: ModalProps) {
    const hk = useHotkeysContext();

    useEffect(() => {
        hk.active = !props.opened;

        return () => { hk.active = true; };
    }, [props.opened, hk]);

    return <Modal {...props}>{props.children}</Modal>;
}

interface SaveCancelModalProps extends ModalProps {
    onSave: () => void,
    onClose: () => void,
    saveLoading?: boolean,
}

export function SaveCancelModal({ onSave, onClose, children, saveLoading, ...other }: SaveCancelModalProps) {
    return (
        <HkModal onClose={onClose} {...other}>
            <Divider my="sm" />
            {children}
            <Divider my="sm" />
            <Group position="center" spacing="md">
                <Button onClick={onSave} variant="filled">
                    {saveLoading === true ? <Loader size="1rem" /> : "Save"}
                </Button>
                <Button onClick={onClose} variant="light">Cancel</Button>
            </Group>
        </HkModal>
    );
}

export function limitTorrentNames(allNames: string[], limit: number = 5) {
    const names: string[] = allNames.slice(0, limit);

    if (allNames.length > limit) names.push(`... and ${allNames.length - limit} more`);

    return names;
}

export function TorrentsNames() {
    const serverData = useServerTorrentData();

    const allNames = useMemo<string[]>(() => {
        if (serverData.current == null || serverData.selected.size === 0) {
            return ["No torrent selected"];
        }

        const selected = serverData.torrents.filter(
            (t) => serverData.selected.has(t.id));

        const allNames: string[] = [];
        selected.forEach((t) => allNames.push(t.name));
        return allNames;
    }, [serverData]);

    const names = limitTorrentNames(allNames);

    return <>
        {names.map((s, i) => <Text key={i} ml="xl" mb="md">{s}</Text>)}
    </>;
}

export interface LocationData {
    path: string,
    setPath: (s: string) => void,
    lastPaths: string[],
    addPath: (dir: string) => void,
    browseHandler: () => void,
    inputLabel?: string,
    disabled?: boolean,
}

export function useTorrentLocation(): LocationData {
    const config = useContext(ConfigContext);
    const serverConfig = useContext(ServerConfigContext);
    const lastPaths = useMemo(() => serverConfig.lastSaveDirs, [serverConfig]);

    const [path, setPath] = useState<string>("");

    useEffect(() => {
        setPath(lastPaths.length > 0 ? lastPaths[0] : "");
    }, [lastPaths]);

    const browseHandler = useCallback(() => {
        const mappedLocation = pathMapFromServer(path, serverConfig);
        console.log("Mapped location: ", mappedLocation);
        dialogOpen({
            title: "Select directory",
            defaultPath: mappedLocation,
            directory: true,
        }).then((directory) => {
            if (directory === null) return;
            const mappedPath = pathMapToServer((directory as string).replace(/\\/g, "/"), serverConfig);
            setPath(mappedPath.replace(/\\/g, "/"));
        }).catch(console.error);
    }, [serverConfig, path, setPath]);

    const addPath = useCallback(
        (dir: string) => { config.addSaveDir(serverConfig.name, dir); },
        [config, serverConfig.name]);

    return { path, setPath, lastPaths, addPath, browseHandler };
}

export function TorrentLocation(props: LocationData) {
    return (
        <Group align="flex-end">
            <TextInput
                value={props.path}
                label={props.inputLabel}
                disabled={props.disabled}
                onChange={(e) => { props.setPath(e.currentTarget.value); }}
                styles={{ root: { flexGrow: 1 } }}
                rightSection={
                    <Menu position="left-start" withinPortal
                        middlewares={{ shift: true, flip: false }} offset={{ mainAxis: -20, crossAxis: 30 }}>
                        <Menu.Target>
                            <ActionIcon py="md" disabled={props.disabled}>
                                <Icon.ClockHistory size="16" />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <ScrollArea.Autosize
                                type="auto"
                                mah="calc(100vh - 0.5rem)"
                                miw="30rem"
                                offsetScrollbars
                                styles={{ viewport: { paddingBottom: 0 } }}
                            >
                                {props.lastPaths.map((path) => (
                                    <Menu.Item key={path} onClick={() => { props.setPath(path); }}>{path}</Menu.Item>
                                ))}
                            </ScrollArea.Autosize>
                        </Menu.Dropdown>
                    </Menu>
                } />
            {TAURI && <Button onClick={props.browseHandler} disabled={props.disabled}>Browse</Button>}
        </Group>
    );
}

function Label({
    label,
    onRemove,
    classNames,
    ...others
}: MultiSelectValueProps) {
    return (
        <div {...others}>
            <Badge radius="md" variant="filled"
                rightSection={
                    <CloseButton
                        onMouseDown={onRemove}
                        variant="transparent"
                        size={22}
                        iconSize={14}
                        tabIndex={-1}
                        mr="-0.25rem"
                    />
                }
            >
                {label}
            </Badge>
        </div>
    );
}

interface TorrentLabelsProps {
    labels: string[],
    setLabels: React.Dispatch<string[]>,
    inputLabel?: string,
    disabled?: boolean,
}

export function TorrentLabels(props: TorrentLabelsProps) {
    const serverData = useServerTorrentData();
    const [data, setData] = useState<string[]>(serverData.allLabels);

    return (
        <MultiSelect
            data={data}
            value={props.labels}
            onChange={props.setLabels}
            label={props.inputLabel}
            withinPortal
            searchable
            creatable
            disabled={props.disabled}
            getCreateLabel={(query) => `+ Add ${query}`}
            onCreate={(query) => {
                setData((current) => [...current, query]);
                return query;
            }}
            valueComponent={Label}
        />
    );
}
