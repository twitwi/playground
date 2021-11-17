import { devicePrototype } from './device/device.prototype';
import { rangeMap } from '../utils/range-map';
import { playgroundFacade } from '../facades/playground.facade';
import { selectCardUi } from '../ui/select-card.ui';
import { networkState } from '../state/network.state';
import { mappingsState } from '../state/mappings.state';
import { mappingsUi } from '../ui/mappings.ui';
import { playgroundUi } from '../ui/playground.ui';
import { layerCardUi } from '../ui/layer-card.ui';

/**
 * Controller is a unique device that controls the playground.
 * It has 3 layout modes:
 *   - Default `0`
 *   - Single selection `1`
 *   - Multiple selection `2`
 */
export const controllerDevice = Object.create (devicePrototype);

controllerDevice.shifted = {
  0: false,
  1: false,
  2: false,
  3: false,
  4: false,
  5: false,
  6: false,
  7: false,
};

/**
 * Initialize the controller.
 *
 * @param {*} device - The device to initialize.
 * @returns {Promise<void>}
 */
controllerDevice.init = async function (device: any): Promise<void> {
  if (this.isInitialized) {
    this.removeListeners ();
  }

  this.isInitialized = false;

  this.device = device;
  this.settings = device.settings;

  await this.runBootSequence ();
  this.isInitialized = true;

  this.updateMode ();
};

controllerDevice.getModeColor = function () {
  if (networkState.isLayerMode) {
    return this.settings.colorByState.layerMode;
  }
  else if (this.isSingleMode || this.isMultipleMode) {
    return this.settings.colorByState.selectMode;
  }
  else {
    return this.settings.colorByState.defaultMode;
  }
};

/**
 * Draw all lights.
 */
controllerDevice.drawLights = function () {
  if (!this.isInitialized) {
    return;
  }

  this.playNotes ({
    firstNote: this.settings.lights.first,
    lastNote: this.settings.lights.last,
    color: this.getModeColor (),
  });
};

/**
 * Set the mode of the controller.
 */
controllerDevice.updateMode = function () {
  if (!this.isInitialized) {
    return;
  }

  this.removeListeners ();
  this.drawLights ();

  if (networkState.isLayerMode) {
    this.setLayerMode ();
  }
  else if (this.isDefaultMode) {
    this.setDefaultMode ();
  }
  else if (this.isSingleMode) {
    this.setSingleMode ();
  }
  else if (this.isMultipleMode) {
    this.setMultipleMode ();
  }
};

/**
 * Set the default mode.
 */
controllerDevice.setDefaultMode = function () {
  this.attachButtonsDefault ();
  this.attachControlsDefault ();
};

/**
 * Set the single mode.
 */
controllerDevice.setSingleMode = function () {
  const node = playgroundFacade.selectedNodes[0];
  this.attachButtonsToNeuron ();
  this.attachControlsToNeuron (node);
};

/**
 * Set the multiple mode.
 */
controllerDevice.setMultipleMode = function () {
  const { selectedNodes } = playgroundFacade;
  selectedNodes.forEach ((node) => {
    this.attachButtonsToNeuron ();
    this.attachControlsToNeuron (node);
  });
};

/**
 * This is called when selection is made.
 */
controllerDevice.onSelectionEvent = function () {
  if (!this.isInitialized) {
    return;
  }

  setTimeout (() => {
    this.updateMode ();
  }, this.settings.time.wait);
};

/**
 * Attach buttons for the default mode.
 */
controllerDevice.attachButtonsDefault = function () {
  this.addNoteListener ('on', (e) => {
    if (!this.isDefaultMode) {
      return;
    }

    const note = parseInt (e.note.number);
    const { isLearning, learningParameter } = mappingsState;

    // learning a new mapping
    if (isLearning && learningParameter) {
      mappingsUi.learn ({
        parameter: learningParameter,
        control: note,
        type: 'button',
      });
    }
    // update targets of already mapped parameters
    else {
      const mappedParameters = mappingsState.getParametersByControl (note);
      mappedParameters.forEach ((parameter) => {
        playgroundUi.updateParameter (parameter, 1);
      });
    }

    // draw feedback lights
    this.playNote ({
      note,
      color: this.settings.colorByState.feedback,
      duration: this.settings.time.defaultDuration,
    });
  });
};

/**
 * Attach controls for the default mode.
 */
controllerDevice.attachControlsDefault = function () {
  this.addControlListener ((e) => {
    const note = parseInt (e.controller.number);
    const { isLearning, learningParameter } = mappingsState;
    const parameters = mappingsState.getParametersByControl (note);

    parameters.forEach ((parameter) => {
      playgroundUi.updateParameter (parameter, e.value);
    });

    if (isLearning && learningParameter) {
      mappingsUi.learn ({
        parameter: learningParameter,
        control: note,
        type: 'range',
      });
    }

    this.playNote ({
      note: this.settings.outputByInput[note],
      duration: this.settings.time.defaultDuration,
      color: this.settings.colorByState.feedback,
    });
  });
};

controllerDevice.attachButtonsToNeuron = function (): void {
  this.addNoteListener ('on', (e) => {
    const inputNote = parseInt (e.note.number);
    const index = this.settings.rows.secondButtons.indexOf (inputNote);
    if (index !== -1) {
      this.shifted[index] = true;
      this.playNote ({
        note: inputNote,
        color: this.settings.colorByState.shift,
      });
    }
  });

  this.addNoteListener ('off', (e) => {
    const inputNote = parseInt (e.note.number);
    const index = this.settings.rows.secondButtons.indexOf (inputNote);
    if (index !== -1) {
      this.shifted[index] = false;
      this.playNote ({
        note: inputNote,
        color: this.settings.colorByState.selectMode,
      });
    }
  });
};

/**
 * Attach events to the ranges.
 *
 * @param {number} selectedNode - The selected node.
 */
controllerDevice.attachControlsToNeuron = function (selectedNode: number): void {
  const { neuron } = networkState.getNeuron (selectedNode);
  const links = neuron.inputLinks;

  // first draw
  setTimeout (() => {
    links.forEach ((link, index) => {
      link.hasSnapped = false;
      this.playNote ({
        note: this.settings.rows.firstButtons[index],
        color: this.settings.colorByState.unsnap,
      });
    });
  }, this.settings.time.wait);

  // listen to changes
  this.addControlListener ((e) => {
    const inputNote = e.controller.number;

    // first row: learning rate
    if (this.settings.rows.firstPots.indexOf (inputNote) !== -1) {
      const index = this.settings.rows.firstPots.indexOf (inputNote);
      if (typeof links[index]?.source === 'undefined') {
        return;
      }
      if (links[index].source.isEnabled === false) {
        return;
      }

      const learningRateOptionIndex = parseInt (
        rangeMap (
          e.value,
          0,
          127,
          0,
          selectCardUi.options.learningRate.length - 1,
        ).toString (),
      );

      const learningRate = selectCardUi.options.learningRate[learningRateOptionIndex];

      if (learningRate !== links[index].source.learningRate) {
        networkState.setSourceLearningRate (index, learningRate);
        selectCardUi.updateSourceLearningRate (index, learningRate);
        playgroundFacade.updateUI ();
      }
    }
    // second row: activation
    else if (this.settings.rows.secondPots.indexOf (inputNote) !== -1) {
      const index = this.settings.rows.secondPots.indexOf (inputNote);
      if (typeof links[index]?.source === 'undefined') {
        return;
      }
      if (links[index].source.isEnabled === false) {
        return;
      }

      const activationOptionIndex = parseInt (
        rangeMap (
          e.value,
          0,
          127,
          0,
          selectCardUi.options.activation.length - 1,
        ).toString (),
      );

      const activation = selectCardUi.options.activation[activationOptionIndex];

      if (activation !== links[index].source.activation.name) {
        networkState.setSourceActivation (index, activation);
        selectCardUi.updateSourceActivation (index, activation);
        playgroundFacade.updateUI ();
      }
    }
    // third row: regularization (shifted) + regularization rate
    else if (this.settings.rows.thirdPots.indexOf (inputNote) !== -1) {
      const index = this.settings.rows.thirdPots.indexOf (inputNote);
      if (typeof links[index]?.source === 'undefined') {
        return;
      }
      if (links[index].source.isEnabled === false) {
        return;
      }

      // regularization (shifted)
      if (this.shifted[index] === true) {
        const regularizationOptionIndex = parseInt (
          rangeMap (
            e.value,
            0,
            127,
            0,
            selectCardUi.options.regularization.length - 1,
          ).toString (),
        );

        const regularization = selectCardUi.options.regularization[regularizationOptionIndex];

        if (regularization !== links[index].source.regularization.name) {
          networkState.setSourceRegularizationType (index, regularization);
          selectCardUi.updateSourceRegularizationType (index, regularization);
          playgroundFacade.updateUI ();
        }
      }
      // regularization rate
      else {
        const regularizationRateOptionIndex = parseInt (
          rangeMap (
            e.value,
            0,
            127,
            0,
            selectCardUi.options.regularizationRate.length - 1,
          ).toString (),
        );

        const regularizationRate = selectCardUi.options.regularizationRate[regularizationRateOptionIndex];

        if (regularizationRate !== links[index].source.regularizationRate) {
          networkState.setSourceRegularizationRate (index, regularizationRate);
          selectCardUi.updateSourceRegularizationRate (index, regularizationRate);
          playgroundFacade.updateUI ();
        }
      }
    }
    // faders: weights + biases (shifted)
    else if (this.settings.rows.faders.indexOf (inputNote) !== -1) {
      const index = this.settings.rows.faders.indexOf (inputNote);
      if (typeof links[index]?.source === 'undefined') {
        return;
      }
      if (links[index].source.isEnabled === false) {
        return;
      }

      // weights
      if (this.shifted[index] === false) {
        // compute the new value
        // intentionally use 2 decimals to avoid high frequency changes
        const value = parseFloat (
          rangeMap (e.value, 0, 127, -1, 1)
            .toFixed (2),
        );

        if (value.toFixed (1) === links[index].weight.toFixed (1)) {
          // snap
          links[index].hasSnapped = true;

          // automatic unsnap
          if (links[index].snapTimer) {
            clearTimeout (links[index].snapTimer);
          }

          links[index].snapTimer = setTimeout (() => {
            links[index].hasSnapped = false;
            this.playNote ({
              note: this.settings.outputByInput[inputNote],
              color: this.settings.colorByState.unsnap,
            });
          }, 800);
        }

        if (links[index].hasSnapped) {
          networkState.setSourceWeight (index, value);
          selectCardUi.updateSourceWeight (index, value);
          playgroundFacade.updateWeightsUI ();
          this.playNote ({
            note: this.settings.outputByInput[inputNote],
            color: this.settings.colorByState.snap,
          });
        }
        else {
          this.playNote ({
            note: this.settings.outputByInput[inputNote],
            color: this.settings.colorByState.unsnap,
          });
        }
      }
      // biases
      else {
        const value = rangeMap (e.value, 0, 127, -1, 1);
        if (value.toFixed (2) !== links[index].source.bias.toFixed (2)) {
          networkState.setSourceBias (index, value);
          selectCardUi.updateSourceBias (index, value);
          playgroundFacade.updateBiasesUI ();
        }
      }
    }
  });
};

Object.defineProperty (controllerDevice, 'isDefaultMode', {
  get () {
    return playgroundFacade.selectedNodes.length === 0;
  },
});

Object.defineProperty (controllerDevice, 'isSingleMode', {
  get () {
    return playgroundFacade.selectedNodes.length === 1;
  },
});

Object.defineProperty (controllerDevice, 'isMultipleMode', {
  get () {
    return playgroundFacade.selectedNodes.length > 1;
  },
});

controllerDevice.setLayerMode = function () {
  this.initializeLayerMode ();
  this.attachButtonsToLayer ();
  this.attachControlsToLayer ();
};

controllerDevice.initializeLayerMode = function () {
  // all nodes
  this.playNotes ({
    firstNote: this.settings.lights.first,
    lastNote: this.settings.lights.last,
    color: this.settings.colorByState.layerMode,
  });

  // color enabled neurons in green
  setTimeout (() => {
    const neurons = networkState.neurons[networkState.selectedLayerIndex];
    neurons.forEach ((neuron) => {
      if (neuron.isEnabled === true) {
        const { neuronIndex } = networkState.getNeuronAndLayerIndexes (parseInt (neuron.id));
        this.playNote ({
          note: this.settings.rows.firstButtons[neuronIndex - 1],
          color: this.settings.colorByState.selectMode,
        });
        this.playNote ({
          note: this.settings.rows.secondButtons[neuronIndex - 1],
          color: this.settings.colorByState.selectMode,
        });
      }
    });
  }, this.settings.time.wait);
};

controllerDevice.attachButtonsToLayer = function (): void {
  this.addNoteListener ('on', (e) => {
    const inputNote = parseInt (e.note.number);
    const index = this.settings.rows.secondButtons.indexOf (inputNote);
    if (index !== -1) {
      this.shifted[index] = true;
      this.playNote ({
        note: inputNote,
        color: this.settings.colorByState.shift,
      });
    }
  });

  this.addNoteListener ('off', (e) => {
    const inputNote = parseInt (e.note.number);
    const index = this.settings.rows.secondButtons.indexOf (inputNote);
    if (index !== -1) {
      this.shifted[index] = false;
      this.playNote ({
        note: inputNote,
        color: this.settings.colorByState.layerMode,
      });
    }
  });
};

controllerDevice.attachControlsToLayer = function (): void {
  const neurons = networkState.neurons[networkState.selectedLayerIndex];

  this.addControlListener ((e) => {
    const inputNote = e.controller.number;

    // first row: learning rate
    if (this.settings.rows.firstPots.indexOf (inputNote) !== -1) {
      const index = this.settings.rows.firstPots.indexOf (inputNote);
      if (neurons[index].isEnabled === false) {
        return;
      }

      const learningRateOptionIndex = parseInt (
        rangeMap (
          e.value,
          0,
          127,
          0,
          selectCardUi.options.learningRate.length - 1,
        ).toString (),
      );

      const learningRate = selectCardUi.options.learningRate[learningRateOptionIndex];

      if (learningRate !== neurons[index].learningRate) {
        networkState.setLearningRate (parseInt (neurons[index].id), learningRate);
        layerCardUi.setLearningRate (index, learningRate);
      }
    }
    else if (this.settings.rows.secondPots.indexOf (inputNote) !== -1) {
      const index = this.settings.rows.secondPots.indexOf (inputNote);
      if (neurons[index].isEnabled === false) {
        return;
      }

      const activationOptionIndex = parseInt (
        rangeMap (
          e.value,
          0,
          127,
          0,
          selectCardUi.options.activation.length - 1,
        ).toString (),
      );

      const activation = selectCardUi.options.activation[activationOptionIndex];

      if (activation !== neurons[index].activation.name) {
        networkState.setActivation (parseInt (neurons[index].id), activation);
        layerCardUi.setActivation (index, activation);
      }
    }
    else if (this.settings.rows.thirdPots.indexOf (inputNote) !== -1) {
      const index = this.settings.rows.thirdPots.indexOf (inputNote);
      if (neurons[index].isEnabled === false) {
        return;
      }

      // regularization (shifted)
      if (this.shifted[index] === true) {
        const regularizationOptionIndex = parseInt (
          rangeMap (
            e.value,
            0,
            127,
            0,
            selectCardUi.options.regularization.length - 1,
          ).toString (),
        );

        const regularization = selectCardUi.options.regularization[regularizationOptionIndex];

        if (regularization !== neurons[index].regularization.name) {
          networkState.setRegularization (parseInt (neurons[index].id), regularization);
          layerCardUi.setRegularization (index, regularization);
        }
      }
      // regularization rate
      else {
        const regularizationRateOptionIndex = parseInt (
          rangeMap (
            e.value,
            0,
            127,
            0,
            selectCardUi.options.regularizationRate.length - 1,
          ).toString (),
        );

        const regularizationRate = selectCardUi.options.regularizationRate[regularizationRateOptionIndex];

        if (regularizationRate !== neurons[index].regularizationRate) {
          networkState.setRegularizationRate (parseInt (neurons[index].id), regularizationRate);
          layerCardUi.setRegularizationRate (index, regularizationRate);
        }
      }
    }
    else if (this.settings.rows.faders.indexOf (inputNote) !== -1) {
      const index = this.settings.rows.faders.indexOf (inputNote);
      if (neurons[index].isEnabled === false) {
        return;
      }
      const value = rangeMap (e.value, 0, 127, -1, 1);
      if (value.toFixed (2) !== neurons[index].bias.toFixed (2)) {
        neurons[index].bias = value;
        layerCardUi.setSourceBias (index, value);
        playgroundFacade.updateBiasesUI ();
      }
    }
  });
};
