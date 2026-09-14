import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, App, Button } from "antd";
import { Download, FileUp, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { CanvasDeleteProjectsDialog } from "@/components/canvas/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "@/components/canvas/canvas-project-card";
import type { CanvasExportFile } from "@/types/canvas-export";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { hasAgentUrlBootstrap } from "@/lib/agent/agent-url-bootstrap";
import { migrateCanvasPersistedState } from "@/lib/canvas/canvas-data-migration";

export default function CanvasPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);
    const autoOpenRef = useRef(false);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const hydrationError = useCanvasStore((state) => state.hydrationError);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    const mode = searchParams.get("mode");
    const agentMode = mode === "new" || mode === "recent" || mode === "choose";
    const agentQuery = agentMode ? `?${searchParams.toString()}` : "";
    const enterProject = (id: string) => {
        const agentHash = hasAgentUrlBootstrap(window.location.hash) ? window.location.hash : "";
        navigate(`/canvas/${id}${agentQuery}${agentHash}`, { replace: Boolean(agentHash) });
    };
    const canMutate = hydrated && !hydrationError;
    const createAndEnter = () => {
        if (!canMutate) return;
        enterProject(createProject(t("canvas.defaultTitle", { count: projects.length + 1 })));
    };
    const importCanvas = async (file?: File) => {
        if (!file || !canMutate) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            if (data.app !== "infinite-canvas" || data.version !== 3 || !Array.isArray(data.projects) || !data.projects.length) throw new Error("invalid canvas export manifest");
            data.projects.forEach((item, index) => {
                if (!item || typeof item !== "object" || !item.project || !Array.isArray(item.files)) throw new Error(`invalid canvas project ${index}`);
                item.files.forEach((fileItem, fileIndex) => {
                    if (!fileItem || typeof fileItem.storageKey !== "string" || typeof fileItem.path !== "string" || typeof fileItem.mimeType !== "string" || !Number.isFinite(fileItem.bytes) || fileItem.bytes < 0)
                        throw new Error(`invalid canvas file ${index}:${fileIndex}`);
                    if (!zip.get(fileItem.path)) throw new Error(`missing canvas file ${fileItem.path}`);
                });
            });
            const migratedProjects = migrateCanvasPersistedState({ projects: data.projects.map((item) => item.project), deletedProjects: [] }).state.projects;
            const files = data.projects.flatMap((item) => item.files.map((fileItem) => ({ fileItem, blob: zip.get(fileItem.path) as Blob })));
            await Promise.all(
                files.map(({ fileItem, blob }) => {
                    const typedBlob = blob.type ? blob : blob.slice(0, blob.size, fileItem.mimeType);
                    return fileItem.storageKey.startsWith("image:") ? setImageBlob(fileItem.storageKey, typedBlob) : setMediaBlob(fileItem.storageKey, typedBlob);
                }),
            );
            migratedProjects.forEach((project) => importProject(project));
            message.success(t("canvas.imported", { count: data.projects.length }));
        } catch {
            message.error(t("canvas.importFailed"));
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    useEffect(() => {
        if (!canMutate || autoOpenRef.current || (mode !== "new" && mode !== "recent")) return;
        autoOpenRef.current = true;
        enterProject(mode === "new" ? createProject(t("canvas.defaultTitle", { count: projects.length + 1 })) : projects[0]?.id || createProject(t("canvas.defaultTitle", { count: projects.length + 1 })));
    }, [canMutate, createProject, mode, projects, t]);

    if (canMutate && (mode === "new" || mode === "recent")) return <main className="flex h-full items-center justify-center bg-background text-sm text-stone-500">{t("canvas.opening")}</main>;

    return (
        <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div>
                        <p className="text-xs text-stone-500">{t("canvas.library")}</p>
                        <h1 className="mt-3 text-3xl font-semibold">{t("canvas.title")}</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedIds.length ? (
                            <>
                                <Button
                                    disabled={!canMutate}
                                    icon={<Download className="size-4" />}
                                    onClick={() =>
                                        void exportCanvasProjects(
                                            projects.filter((project) => selectedIds.includes(project.id)),
                                            `${t("canvas.title")}-${selectedIds.length}`,
                                        )
                                    }
                                >
                                    {t("canvas.exportSelected")}
                                </Button>
                                <Button disabled={!canMutate} onClick={() => setDeleteIds(selectedIds)}>
                                    {t("canvas.deleteSelected")}
                                </Button>
                            </>
                        ) : null}
                        {projects.length ? (
                            <Button disabled={!canMutate} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                                {t("canvas.deleteAll")}
                            </Button>
                        ) : null}
                        <Button disabled={!canMutate} icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                            {t("canvas.import")}
                        </Button>
                        <Button disabled={!canMutate} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            {t("canvas.create")}
                        </Button>
                    </div>
                </header>

                {hydrationError ? (
                    <Alert type="error" showIcon message={t("canvas.storageErrorTitle")} description={t("canvas.storageErrorDescription", { error: hydrationError })} />
                ) : !hydrated ? (
                    <section className="flex min-h-[360px] items-center justify-center border-y border-stone-200 text-sm text-stone-500 dark:border-stone-800">{t("canvas.loading")}</section>
                ) : projects.length ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {projects.map((project) => (
                            <CanvasProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                ) : (
                    <section className="flex min-h-[360px] flex-col items-center justify-center border-y border-stone-200 text-center dark:border-stone-800">
                        <h2 className="text-xl font-medium">{t("canvas.empty")}</h2>
                        <p className="mt-3 text-sm text-stone-500">{t("canvas.emptyDescription")}</p>
                        <Button type="primary" className="mt-6" icon={<Plus className="size-4" />} disabled={!canMutate} onClick={createAndEnter}>
                            {t("canvas.create")}
                        </Button>
                    </section>
                )}
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" disabled={!canMutate} onChange={(event) => void importCanvas(event.target.files?.[0])} />
            {!hydrationError ? <CanvasDeleteProjectsDialog /> : null}
        </main>
    );
}
