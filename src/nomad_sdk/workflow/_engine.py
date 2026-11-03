"""``NomadWorkflow``: fills default I/O edges and generates the workflow archive.

Ported verbatim from ``nomad_utility_workflows.utils.workflows`` (v0.3.x).
Behavioural changes are limited to removing import-time global side effects
(``logging.basicConfig`` and process-wide PyYAML representers).
"""

import logging
from typing import Any, Literal, Optional, Union

import networkx as nx
from pydantic import BaseModel, Field

from nomad_sdk.workflow._archive import NomadSection, NomadTask, NomadWorkflowArchive
from nomad_sdk.workflow._graph import NodeAttributesUniverse, nodes_to_graph

logger = logging.getLogger(__name__)


class NomadWorkflow(BaseModel):
    """
    Represents a NOMAD workflow and provides methods to build and serialize it.

    This class manages the workflow graph, node attributes, and the logic for
    constructing a NOMAD-compatible workflow archive. It supports registering
    nodes, resolving edges, adding default sections, and exporting the workflow
    to a YAML file for use with NOMAD systems.

    Attributes:
        destination_filename (str):
            Path to the output YAML file for the workflow archive.
        m_def (str):
            NOMAD m_def path for the workflow type.
        name (str):
            User-defined name for the workflow.
        archive_section (str):
            Root section of the archive to store the workflow.
        node_attributes_universe (NodeAttributesUniverse):
            Universe of node attributes for the workflow graph.
        workflow_graph (nx.DiGraph):
            Directed graph representing the workflow structure.
        task_elements (dict[str, NomadSection]):
            Registered sections for each node in the workflow.
        simulation_default_sections (dict[str, list[str]]):
            Default input and output sections for simulation tasks.
    """

    destination_filename: str = Field(
        './nomad_custom_workflow_archive.yaml',
        description='The full path and filename to write the output yaml file.',
    )
    m_def: Optional[str] = Field(
        None, description='The NOMAD m_def path for a specific workflow type.'
    )
    name: Optional[str] = Field(None, description='User-defined name for the workflow.')
    archive_section: str = Field(
        'workflow2',
        description='The root section of the archive to store the workflow.',
    )
    node_attributes_universe: NodeAttributesUniverse = Field(default_factory=dict)
    workflow_graph: Optional[nx.DiGraph] = None
    task_elements: dict[str, NomadSection] = Field(default_factory=dict)
    simulation_default_sections: dict[str, list[str]] = Field(
        default_factory=dict,
        description='Default input and output sections for simulation tasks',
    )

    class Config:
        arbitrary_types_allowed = True

    def __init__(self, **data):
        super().__init__(**data)
        self.task_elements = {}
        self.simulation_default_sections = {
            'inputs': ['system'],
            'outputs': ['system', 'calculation'],
        }
        # ! add more defaults here
        if self.workflow_graph is None:
            self.workflow_graph = nodes_to_graph(self.node_attributes_universe)
        self._fill_workflow_graph()

    def register_section(
        self, node_key: Union[int, str, tuple], node_attrs: dict[str, Any]
    ) -> None:
        section = NomadSection(**node_attrs)
        self.task_elements[node_key] = section

    def _fill_workflow_graph(self) -> None:
        """_summary_"""
        for node_source, node_dest, edge in list(self.workflow_graph.edges(data=True)):
            self._resolve_edge_inputs(node_source, node_dest, edge)
            self._resolve_edge_outputs(node_source, node_dest, edge)
            self._add_defaults(node_source, node_dest, edge)

    def _resolve_edge_inputs(self, node_source, node_dest, edge) -> None:
        if not edge.get('inputs'):
            nx.set_edge_attributes(
                self.workflow_graph, {(node_source, node_dest): {'inputs': []}}
            )
        for input_ in edge['inputs']:
            if not input_.get('path_info', {}):
                continue
            if not input_['path_info'].get('mainfile_path', ''):
                input_['path_info']['mainfile_path'] = self._get_mainfile_path(
                    node_source
                )

    def _resolve_edge_outputs(self, node_source, node_dest, edge) -> None:
        if not edge.get('outputs'):
            nx.set_edge_attributes(
                self.workflow_graph, {(node_source, node_dest): {'outputs': []}}
            )
        for output_ in edge.get('outputs', []):
            if not output_.get('path_info', {}):
                continue
            if not output_['path_info'].get('mainfile_path', ''):
                node_source_type = self.workflow_graph.nodes[node_source].get(
                    'type', ''
                )
                if node_source_type == 'input':
                    output_['path_info']['mainfile_path'] = self._get_mainfile_path(
                        node_dest
                    )
                else:
                    output_['path_info']['mainfile_path'] = self._get_mainfile_path(
                        node_source
                    )

    def _add_defaults(self, node_source, node_dest, edge) -> None:
        if self.workflow_graph.nodes[node_source].get('type', '') in [
            'task',
            'workflow',
        ]:
            for outputs_ in self._get_defaults('outputs', node_source, node_dest):
                edge['inputs'].append(outputs_)
                # add the output to the graph
                self.workflow_graph.add_node(
                    len(self.workflow_graph.nodes), type='output', **outputs_
                )
                self.workflow_graph.add_edge(
                    node_source, len(self.workflow_graph.nodes) - 1
                )
        if self.workflow_graph.nodes[node_dest].get('type', '') in ['task', 'workflow']:
            for inputs_ in self._get_defaults('inputs', node_source, node_dest):
                edge['outputs'].append(inputs_)
                # add the input to the graph
                self.workflow_graph.add_node(
                    len(self.workflow_graph.nodes), type='input', **inputs_
                )
                self.workflow_graph.add_edge(
                    len(self.workflow_graph.nodes) - 1, node_dest
                )

    def _get_mainfile_path(self, node):
        return (
            self.workflow_graph.nodes[node]
            .get('path_info', '')
            .get('mainfile_path', '')
        )

    def _check_for_defaults(self, inout_type, edge, proposed_path_info) -> bool:
        # ! The current method would prevent multiple inputs from the same section
        # TODO - look into removing duplicates after the registration of the section
        inout_type = 'inputs' if inout_type == 'outputs' else 'outputs'
        for input_ in edge.get(inout_type, []):
            if input_.get('path_info', {}).get(
                'section_type', ''
            ) == proposed_path_info.get('section_type', ''):
                if input_.get('path_info', {}).get(
                    'mainfile_path', ''
                ) == proposed_path_info.get('mainfile_path', ''):
                    return True
            # ? Not sure if this second case is needed
            if input_.get('path_info', {}).get(
                'supersection_path', ''
            ) == proposed_path_info.get('section_type', ''):
                if input_.get('path_info', {}).get(
                    'mainfile_path', ''
                ) == proposed_path_info.get('mainfile_path', ''):
                    return True
        return False

    def _get_defaults(
        self, inout_type: Literal['inputs', 'outputs'], node_source, node_dest
    ) -> list:
        entry_type_source = self.workflow_graph.nodes[node_source].get('entry_type', '')
        node_source_type = self.workflow_graph.nodes[node_source].get('type', '')
        entry_type_dest = self.workflow_graph.nodes[node_dest].get('entry_type', '')
        node_dest_type = self.workflow_graph.nodes[node_dest].get('type', '')

        inouts = []
        if inout_type == 'outputs':  # Gets outputs for the source node
            if node_dest_type == 'output':
                partner_node = node_dest
                # adds the global output
                inouts += self._get_general_defaults(
                    inout_type, partner_node, node_source, node_dest
                )
            if entry_type_source == 'simulation':
                partner_node = node_source
                # adds output sys + calc
                inouts += self._get_simulation_defaults(
                    inout_type, partner_node, node_source, node_dest
                )
            if not inouts:
                partner_node = node_source
                # adds the general archive path of source to its output
                inouts += self._get_general_defaults(
                    inout_type, partner_node, node_source, node_dest
                )
        elif inout_type == 'inputs':  # Gets inputs for the dest node
            if node_source_type == 'input':
                partner_node = node_source
                # adds the global input
                inouts += self._get_general_defaults(
                    inout_type, partner_node, node_source, node_dest
                )
            elif entry_type_source == 'simulation':
                partner_node = node_source
                # adds the output sys + calc? from source to dest input
                inouts += self._get_simulation_defaults(
                    inout_type, partner_node, node_source, node_dest
                )
            else:
                partner_node = node_source
                # adds the general archive path of source to its input
                inouts += self._get_general_defaults(
                    inout_type, partner_node, node_source, node_dest
                )
                if entry_type_dest == 'simulation':
                    partner_node = node_dest
                    # adds the input sys from dest to its own input
                    inouts += self._get_simulation_defaults(
                        inout_type, partner_node, node_source, node_dest
                    )

        return inouts

    def _get_general_defaults(self, inout_type, partner_node, node_source, node_dest):
        section = NomadSection(**self.workflow_graph.nodes[partner_node])
        archive_path = section.archive_path
        default_sections = {
            'inputs': [archive_path],
            'outputs': [archive_path],
        }

        inouts = []
        for default_section in default_sections[inout_type]:
            partner_name = self.workflow_graph.nodes[partner_node].get('name', '')
            proposed_path_info = self.workflow_graph.nodes[partner_node].get(
                'path_info', {}
            )
            proposed_path_info['archive_path'] = default_section
            if not self._flag_defaults(
                inout_type, node_source, node_dest, proposed_path_info
            ):
                inouts.append(
                    {
                        'name': (
                            f'{inout_type[:-1]} {default_section} from {partner_name}'
                        ),
                        'path_info': proposed_path_info,
                        'is_default': True,
                    },
                )
        return inouts

    def _get_simulation_defaults(
        self, inout_type, partner_node, node_source, node_dest
    ):
        default_sections = self.simulation_default_sections
        inouts = []
        for default_section in default_sections[inout_type]:
            partner_name = self.workflow_graph.nodes[partner_node].get('name', '')
            # TODO - check this when reassessing the method for simulation defaults
            path_info = self.workflow_graph.nodes[partner_node].get('path_info', {})
            proposed_path_info = {}
            proposed_path_info['entry_id'] = path_info.get('entry_id', None)
            proposed_path_info['upload_id'] = path_info.get('upload_id', None)
            proposed_path_info['section_type'] = default_section
            proposed_path_info['mainfile_path'] = self._get_mainfile_path(partner_node)

            if not self._flag_defaults(
                inout_type,
                node_source,
                node_dest,
                proposed_path_info,
            ):
                inouts.append(
                    {
                        'name': (
                            f'{inout_type[:-1]} {default_section} from {partner_name}'
                        ),
                        'path_info': proposed_path_info,
                    },
                )
        return inouts

    def _flag_defaults(
        self,
        inout_type,
        node_source,
        node_dest,
        proposed_path_info,
    ):
        flag_defaults = False
        if inout_type == 'outputs':
            for _, _, edge2 in self.workflow_graph.out_edges(node_source, data=True):
                if self._check_for_defaults(inout_type, edge2, proposed_path_info):
                    flag_defaults = True
                    break
        elif inout_type == 'inputs':
            for _, _, edge2 in self.workflow_graph.in_edges(node_dest, data=True):
                if self._check_for_defaults(inout_type, edge2, proposed_path_info):
                    flag_defaults = True
                    break
        return flag_defaults

    def build_workflow_yaml(self) -> None:
        """
        Construct and serialize the workflow archive to a YAML file.

        This method registers all nodes in the workflow graph as sections, builds the
        internal task elements, generates the workflow archive, removes duplicate
        inputs/outputs, and writes the resulting archive to the YAML file specified by
        `self.destination_filename`. The resulting YAML file is compatible with the
        NOMAD workflow schema and can be used for further processing or import into
        NOMAD systems.

        After writing the file, a summary message is logged with the output filename.
        """
        # register the sections and build task_elements
        # register the nodes as sections for the archive construction
        for (
            node_key,
            node_attrs,
        ) in self.workflow_graph.nodes(data=True):
            self.register_section(node_key, node_attrs)

        archive = self.generate_archive()
        archive.remove_duplicate_ios()
        archive.to_yaml(self.destination_filename)
        logger.info(f'NOMAD workflow written to {self.destination_filename}')

    def generate_archive(self) -> NomadWorkflowArchive:
        archive = NomadWorkflowArchive(
            archive_section=self.archive_section, m_def=self.m_def, name=self.name
        )
        archive.inputs = []
        archive.outputs = []

        task_graph = self._create_task_graph()
        self._add_inputs_to_archive(archive, task_graph)
        self._add_outputs_to_archive(archive, task_graph)
        self._add_tasks_to_archive(archive, task_graph)

        return archive

    def _create_task_graph(self) -> nx.DiGraph:
        task_nodes = [
            n
            for n, attr in self.workflow_graph.nodes(data=True)
            if attr.get('type', '') in ['task', 'workflow']
        ]
        return self.workflow_graph.subgraph(task_nodes)

    def _add_inputs_to_archive(
        self, archive: NomadWorkflowArchive, task_graph: nx.DiGraph
    ) -> None:
        for node in [n for n, d in task_graph.in_degree if d == 0]:
            for edge in self.workflow_graph.in_edges(node, data=True):
                if self.workflow_graph.nodes[edge[0]].get('type', '') != 'input':
                    continue
                if self.workflow_graph.nodes[edge[0]].get('is_default', '') is True:
                    continue
                element = self.task_elements[edge[0]]
                archive.inputs.append(element)

    def _add_outputs_to_archive(
        self, archive: NomadWorkflowArchive, task_graph: nx.DiGraph
    ) -> None:
        for node in [n for n, d in task_graph.out_degree if d == 0]:
            for edge in self.workflow_graph.out_edges(node, data=True):
                if self.workflow_graph.nodes[edge[1]].get('type', '') != 'output':
                    continue
                if self.workflow_graph.nodes[edge[1]].get('is_default', '') is True:
                    continue
                element = self.task_elements[edge[1]]
                archive.outputs.append(element)

    def _add_tasks_to_archive(
        self, archive: NomadWorkflowArchive, task_graph: nx.DiGraph
    ) -> None:
        for node_key, node in task_graph.nodes(data=True):
            inputs = []
            outputs = []
            for _, _, edge in self.workflow_graph.out_edges(node_key, data=True):
                if edge.get('inputs'):
                    outputs.extend(edge.get('inputs'))
            for _, _, edge in self.workflow_graph.in_edges(node_key, data=True):
                if edge.get('outputs'):
                    inputs.extend(edge.get('outputs'))

            archive.tasks.append(
                NomadTask(
                    name=node.get('name', ''),
                    inputs=inputs,
                    outputs=outputs,
                    task_section=self.task_elements[node_key],
                )
            )
