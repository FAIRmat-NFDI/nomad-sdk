"""User-facing node specification and graph construction (``nodes_to_graph``).

Ported verbatim from ``nomad_utility_workflows.utils.workflows`` (v0.3.x).
Behavioural changes are limited to removing import-time global side effects
(``logging.basicConfig`` and process-wide PyYAML representers).
"""

import logging
from typing import Any

import networkx as nx
from pydantic import BaseModel, Field

from nomad_sdk.workflow._archive import (
    EntryType,
    PathInfo,
    SectionType,
)

logger = logging.getLogger(__name__)


class NodeAttributes(BaseModel):
    """
    NodeAttributes represents the attributes of a node in the NOMAD workflow graph.

    Attributes:
        name (str): A free-form string describing this node, which will be used as a
                    label in the NOMAD workflow graph visualizer.

        type (Literal['input', 'output', 'workflow', 'task']):
            Specifies the type of node. Must be one of the specified options.

            - input: (meta)data taken as input for the entire workflow or a specific
                    task. For simulations, often corresponds to a section within the
                    archive (e.g., system, method).

            - output: (meta)data produced as output for the entire workflow or a
                    specific task. For simulations, often corresponds to a section
                    within the archive (e.g., calculation).

            - workflow: A node in the workflow which itself contains an internal
                    (sub)workflow, that is recognized by NOMAD. Such nodes can be
                    linked to existing workflows within NOMAD, providing
                    functionalities within NOMAD's interactive workflow graphs.

            - task: A node in the workflow which represents an individual task
                    (i.e., no underlying workflow), that is recognized by NOMAD.

        entry_type (Literal['simulation']): Specifies the type of node in terms of
            tasks or workflows recognized by NOMAD. Functionally, this attribute is
            used to create default inputs and outputs that are required for properly
            creating the edge visualizations in the NOMAD GUI.

        path_info (dict): Information for generating the NOMAD archive section paths
            (i.e., connections between nodes in terms of the NOMAD MetaInfo sections).

            - upload_id (str): NOMAD PID for the upload, if exists.

            - entry_id (str): NOMAD PID for the entry, if exists.

            - mainfile_path (str): Local (relative to the native upload) path to the
                mainfile, including the mainfile name with extension.

            - supersection_path (str): Archive path to the supersection, e.g.,
                "run" or "workflow2/method".

            - supersection_index (int): The relevant index for the supersection, if it
                is a repeating subsection.

            - section_type (str): The name of the section for an input or output node,
                e.g., "system", "method", or "calculation".

            - section_index (int): The relevant index for the section, if it is a
                repeating subsection.

            - archive_path (str): Specifies the entire archive path to the section,
                e.g., "run/0/system/2".

        inputs (list[dict]): A list of input nodes to be added to the graph with
            in_edges to the parent node.

            - name (str): Will be set as the name for the input node created.

            - path_info (dict): Path information for the input node created, as
                specified for the node attributes above.

        outputs (list[dict]): A list of output nodes to be added to the graph with
            out_edges from the parent node.

            - name (str): Will be set as the name for the output node created.

            - path_info (dict): Path information for the output node created, as
                specified for the node attributes above.

        in_edge_nodes (list[int]): A list of integers specifying the node keys which
            contain in-edges to this node.

        out_edge_nodes (list[int]): A list of integers specifying the node keys which
            contain out-edges to this node.
    """

    name: str = Field(None, description='A free-form string describing this node.')
    type: SectionType = Field(None, description='The type of node.')
    entry_type: EntryType = Field(
        None, description='The type of node recognized by NOMAD.'
    )
    path_info: PathInfo = Field(
        None, description='Information for generating the NOMAD archive section paths.'
    )
    inputs: list[dict[str, Any]] = Field(
        default_factory=list,
        description='A list of input nodes to be added to the graph.',
    )
    outputs: list[dict[str, Any]] = Field(
        default_factory=list,
        description='A list of output nodes to be added to the graph.',
    )
    in_edge_nodes: list[int] = Field(
        default_factory=list, description='Nodes with in-edges to this node.'
    )
    out_edge_nodes: list[int] = Field(
        default_factory=list, description='Nodes with out-edges to this node.'
    )

    def __init__(self, **data):
        super().__init__(**data)
        if self.type == 'workflow':
            if not self.path_info:
                return
            if not self.path_info.get('archive_path'):
                self.path_info['archive_path'] = 'workflow2'

    def get(self, key: str, default: Any = None) -> Any:
        """
        Allows dictionary-like access to the attributes of the NodeAttributes class.

        Args:
            key (str): The attribute name to retrieve.
            default (Any): The default value to return if the attribute is not found.

        Returns:
            Any: The value of the attribute if it exists, otherwise the default value.
        """
        return getattr(self, key, default)


class NodeAttributesUniverse(BaseModel):
    """
    Container for all node attributes in a NOMAD workflow graph.

    This class holds a mapping from node keys (integers) to their corresponding
    `NodeAttributes` objects, representing the full set of nodes in a workflow.
    It is used as the input for building the workflow graph and for serializing
    or deserializing workflow definitions.

    Attributes:
        nodes (dict[int, NodeAttributes]):
            Dictionary mapping node keys to their attributes.
    """

    nodes: dict[int, NodeAttributes]


def nodes_to_graph(node_attributes_universe: 'NodeAttributesUniverse') -> nx.DiGraph:
    """Builds a workflow graph (nx.DiGraph) from a NodeAttributesUniverse of node
    attributes as specified below.

    Args:
        node_attributes_universe: A NodeAttributesUniverse object containing the node

    Returns:
        nx.DiGraph: _description_
    """
    if not node_attributes_universe:
        raise TypeError(
            'No workflow graph or node attributes provided. Cannot build workflow.'
        )

    workflow_graph = nx.DiGraph()
    workflow_graph.add_nodes_from(node_attributes_universe.nodes.keys())
    nx.set_node_attributes(workflow_graph, node_attributes_universe.nodes)

    for node_key, node_attrs in list(workflow_graph.nodes(data=True)):
        _add_edges(workflow_graph, node_key, node_attrs)
        _add_global_inouts(workflow_graph, node_key, node_attrs)
        _add_task_inouts(workflow_graph, node_key, node_attrs)

    return workflow_graph


def _add_edges(workflow_graph, node_key, node_attrs):
    def set_mainfile_path(workflow_graph, edge, node_attrs) -> None:
        parent_mainfile_path = (
            workflow_graph.nodes[edge].get('path_info', '').get('mainfile_path', None)
        )
        if not node_attrs.get('path_info'):
            node_attrs['path_info'] = {'mainfile_path': parent_mainfile_path}
        else:
            node_attrs['path_info']['mainfile_path'] = node_attrs['path_info'].get(
                'mainfile_path', parent_mainfile_path
            )

    for edge in node_attrs.get('in_edge_nodes', []):
        workflow_graph.add_edge(edge, node_key)
        set_mainfile_path(workflow_graph, edge, node_attrs)
    for edge in node_attrs.get('out_edge_nodes', []):
        workflow_graph.add_edge(node_key, edge)
        set_mainfile_path(workflow_graph, edge, node_attrs)


def _add_global_inouts(workflow_graph, node_key, node_attrs):
    if node_attrs.get('type', '') == 'input':
        for edge_node in node_attrs.get('out_edge_nodes', []):
            workflow_graph.add_edge(node_key, edge_node)
    elif node_attrs.get('type', '') == 'output':
        for edge_node in node_attrs.get('in_edge_nodes', []):
            workflow_graph.add_edge(edge_node, node_key)


def _add_task_inouts(workflow_graph, node_key, node_attrs):
    inputs = node_attrs.pop('inputs', [])
    for input_ in inputs:
        edge_nodes = input_.get('out_edge_nodes', [])
        if not edge_nodes:
            edge_nodes.append(len(workflow_graph.nodes))
            workflow_graph.add_node(edge_nodes[0], type='input', **input_)

        for edge_node in edge_nodes:
            workflow_graph.add_edge(edge_node, node_key)
            if not workflow_graph.edges[edge_node, node_key].get('outputs', []):
                nx.set_edge_attributes(
                    workflow_graph, {(edge_node, node_key): {'outputs': []}}
                )
            workflow_graph.edges[edge_node, node_key]['outputs'].append(input_)

    outputs = node_attrs.pop('outputs', [])
    for output_ in outputs:
        edge_nodes = output_.get('in_edge_node', [])
        if not edge_nodes:
            edge_nodes.append(len(workflow_graph.nodes))
            workflow_graph.add_node(edge_nodes[0], type='output', **output_)

        for edge_node in edge_nodes:
            workflow_graph.add_edge(node_key, edge_node)
            if not workflow_graph.edges[node_key, edge_node].get('inputs', []):
                nx.set_edge_attributes(
                    workflow_graph, {(node_key, edge_node): {'inputs': []}}
                )
            workflow_graph.edges[node_key, edge_node]['inputs'].append(output_)


# TODO prevent duplicates to global outputs
# TODO the input from in edge task nodes are automatically added to the global inputs...
# TODO but not vice versa, the reverse should be done...
# TODO also prevent that the same ios are added 2x
# TODO I need to check that the defaults are generated properly when you have multiple
# input or output task nodes.
# TODO we need to fix the default inputs, so that system[-1] is not added, and instead
# either the global input or possibly system[0] only
# TODO -1 notation doesn't work for run for connections!!
# TODO test this code on a number of already existing examples
# TODO create docs with some examples for dict and graph input types
# TODO add to readme/docs that this is not currently using NOMAD, but could be linked
# later?
# TODO add some text to the test notebooks
# TODO change the rest of the functions to pydantic -- not sure if I really want to
# tackle this now
# TODO advanced defaults for simulation --
# -- look into a subworkflow for the output system from the final task
