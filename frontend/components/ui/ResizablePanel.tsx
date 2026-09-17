"use client";
import { cn } from "@/lib/utils";
import { useRef, useState, useCallback, useEffect } from "react";

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  side: "left" | "right";
  className?: string;
}

export function ResizablePanel({
  children,
  defaultWidth = 340,
  minWidth = 280,
  maxWidth = 600,
  side,
  className
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const isResizing = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !panelRef.current) return;

      const panelRect = panelRef.current.getBoundingClientRect();
      let newWidth: number;

      if (side === "left") {
        newWidth = e.clientX - panelRect.left;
      } else {
        newWidth = panelRect.right - e.clientX;
      }

      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [minWidth, maxWidth, side]);

  return (
    <div
      ref={panelRef}
      className={cn("relative shrink-0", className)}
      style={{ width }}
    >
      {children}
      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "absolute top-0 bottom-0 w-1 cursor-col-resize z-50 group",
          "hover:bg-purple-500/30 active:bg-purple-500/50 transition-colors",
          side === "left" ? "right-0" : "left-0"
        )}
      >
        <div className={cn(
          "absolute top-1/2 -translate-y-1/2 w-0.5 h-8 bg-zinc-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
          side === "left" ? "right-0" : "left-0"
        )} />
      </div>
    </div>
  );
}

interface ResizableVerticalPanelProps {
  children: React.ReactNode;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
}

export function ResizableVerticalPanel({
  children,
  defaultHeight = 220,
  minHeight = 100,
  maxHeight = 500,
  className
}: ResizableVerticalPanelProps) {
  const [height, setHeight] = useState(defaultHeight);
  const isResizing = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !panelRef.current) return;

      const panelRect = panelRef.current.getBoundingClientRect();
      const newHeight = panelRect.bottom - e.clientY;
      
      setHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [minHeight, maxHeight]);

  return (
    <div
      ref={panelRef}
      className={cn("relative shrink-0", className)}
      style={{ height }}
    >
      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "absolute left-0 right-0 top-0 h-1 cursor-row-resize z-50 group",
          "hover:bg-purple-500/30 active:bg-purple-500/50 transition-colors"
        )}
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-0 h-0.5 w-8 bg-zinc-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      {children}
    </div>
  );
}
