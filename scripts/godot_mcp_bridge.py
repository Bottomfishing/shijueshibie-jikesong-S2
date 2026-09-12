#!/usr/bin/env python3
import json
import os
import socket
import sys

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "godot-mcp"
SERVER_VERSION = "0.1.0"

HOST = os.environ.get("GODOT_MCP_HOST", "127.0.0.1")
PORT = int(os.environ.get("GODOT_MCP_PORT", "6400"))
TIMEOUT = float(os.environ.get("GODOT_MCP_TIMEOUT", "15"))

COMMANDS = [
    "GET_SCENE_INFO",
    "OPEN_SCENE",
    "SAVE_SCENE",
    "NEW_SCENE",
    "CREATE_OBJECT",
    "CREATE_CHILD_OBJECT",
    "DELETE_OBJECT",
    "FIND_OBJECTS_BY_NAME",
    "GET_OBJECT_PROPERTIES",
    "SET_PROPERTY",
    "SET_NESTED_PROPERTY",
    "SET_OBJECT_TRANSFORM",
    "SET_PARENT",
    "SET_MESH",
    "SET_MATERIAL",
    "SET_COLLISION_SHAPE",
    "GET_ASSET_LIST",
    "IMPORT_ASSET",
    "REIMPORT_ASSET",
    "IMPORT_GLB_SCENE",
    "CREATE_PREFAB",
    "INSTANTIATE_PREFAB",
    "CREATE_SCRIPT",
    "UPDATE_SCRIPT",
    "VIEW_SCRIPT",
    "LIST_SCRIPTS",
    "DELETE_SCRIPT",
    "DELETE_FILE",
    "EDITOR_CONTROL",
    "SHOW_MESSAGE",
]

TOOLS = [
    {
        "name": "godot_ping",
        "description": "Check that the Godot editor plugin on {}:{} is reachable. Returns pong.".format(HOST, PORT),
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "godot_command",
        "description": (
            "Send a command to the running Godot editor via the godot_mcp addon.\n"
            "The editor must be open with the plugin enabled.\n"
            "Common shapes:\n"
            "  GET_SCENE_INFO {}\n"
            "  OPEN_SCENE {scene_path, save_current?}\n"
            "  CREATE_OBJECT {type, name, location?, rotation?, scale?, replace_if_exists?}\n"
            "  CREATE_CHILD_OBJECT {parent_name, type, name, location?, rotation?, scale?}\n"
            "  SET_PROPERTY {node_name, property_name, value, force_type?}\n"
            "  SET_NESTED_PROPERTY {node_name, property_name, value, value_type?} (WorldEnvironment only)\n"
            "  SET_MESH {node_name, mesh_type, radius?, height?, size?}\n"
            "  SET_MATERIAL {object_name, material_name, color, create_if_missing?}\n"
            "  CREATE_SCRIPT {script_name, script_type?, script_folder?, content?, overwrite?}\n"
            "  UPDATE_SCRIPT {script_path, content, create_if_missing?}\n"
            "  VIEW_SCRIPT {script_path}\n"
            "  GET_ASSET_LIST {folder?, type?, search_pattern?} (non-recursive)\n"
            "  EDITOR_CONTROL {command: PLAY|STOP|SAVE}\n"
            "parent_name accepts \"root\" for the scene root. node names accept Parent/Child paths.\n"
            "property_name accepts sub-properties like \"position:x\"."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "type": {"type": "string", "enum": COMMANDS, "description": "Command type."},
                "params": {"type": "object", "description": "Command parameters.", "default": {}},
            },
            "required": ["type"],
            "additionalProperties": False,
        },
    },
]


def call_godot(command_type, params):
    payload = json.dumps({"type": command_type, "params": params or {}}).encode("utf-8")
    sock = socket.create_connection((HOST, PORT), timeout=TIMEOUT)
    try:
        sock.sendall(payload)
        buffer = b""
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            buffer += chunk
            try:
                return json.loads(buffer.decode("utf-8"))
            except ValueError:
                continue
    finally:
        sock.close()
    if not buffer:
        raise RuntimeError("Godot closed the connection without responding.")
    raise RuntimeError("Incomplete response from Godot: {!r}".format(buffer[:512]))


def run_tool(name, arguments):
    if name == "godot_ping":
        return call_godot("ping", {})
    if name == "godot_command":
        command_type = arguments.get("type")
        if not command_type:
            raise ValueError("Missing required argument: type")
        return call_godot(command_type, arguments.get("params") or {})
    raise ValueError("Unknown tool: {}".format(name))


def write_message(message):
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def respond(request_id, result):
    write_message({"jsonrpc": "2.0", "id": request_id, "result": result})


def respond_error(request_id, code, message):
    write_message({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})


def handle(request):
    method = request.get("method")
    request_id = request.get("id")
    params = request.get("params") or {}

    if method == "initialize":
        respond(request_id, {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        })
        return

    if method in ("notifications/initialized", "initialized"):
        return

    if method == "ping":
        respond(request_id, {})
        return

    if method == "tools/list":
        respond(request_id, {"tools": TOOLS})
        return

    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") or {}
        try:
            result = run_tool(name, arguments)
        except (socket.error, OSError) as exc:
            respond(request_id, {
                "content": [{
                    "type": "text",
                    "text": "Cannot reach Godot at {}:{} ({}). Open the Godot editor with the godot_mcp "
                            "addon enabled, then retry.".format(HOST, PORT, exc),
                }],
                "isError": True,
            })
            return
        except Exception as exc:
            respond(request_id, {
                "content": [{"type": "text", "text": "{}: {}".format(type(exc).__name__, exc)}],
                "isError": True,
            })
            return
        is_error = isinstance(result, dict) and result.get("status") == "error"
        respond(request_id, {
            "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)}],
            "isError": is_error,
        })
        return

    if request_id is not None:
        respond_error(request_id, -32601, "Method not found: {}".format(method))


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except ValueError:
            continue
        if isinstance(request, list):
            for item in request:
                handle(item)
        else:
            handle(request)


if __name__ == "__main__":
    main()
